import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { NextResponse } from 'next/server';
import { buildExportCsv, exportHeaderLines, istDateTime, type ColumnType, type ExportInput, type ReportColumn } from './reporting';
import { FIGURE_DEFINITIONS, REPORT_TIMEZONE_LABEL, type ExportFormat } from './resources/reports';

/**
 * Builds the three export files (CSV, Excel, PDF) from one `ExportInput`, so
 * every format carries the same header block, the same rows and the same
 * totals. Server only: runs in the Node.js runtime of a route handler.
 *
 * Nothing here calls an outside service. The files are built in memory.
 */

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** A PDF is for reading and printing; beyond this many rows it lists the first rows only and says so. */
export const PDF_MAX_ROWS = 5000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(value: any): boolean {
  return value === null || value === undefined || value === '';
}

function asDate(value: any): Date | null {
  if (isBlank(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

const XLSX_FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  money: '#,##0.00',
  number: '#,##0',
  percent: '0.00"%"',
  datetime: 'yyyy-mm-dd hh:mm:ss',
};

/**
 * The value written into a cell. Numbers stay numbers and dates become real
 * Excel dates. Excel dates carry no timezone, so a moment in time is written
 * as its wall-clock time in IST, which is what the header says the file uses.
 */
function xlsxValue(value: any, type: ColumnType): { value: ExcelJS.CellValue; format?: string } {
  if (isBlank(value)) return { value: null };
  if (type === 'datetime') {
    const date = asDate(value);
    if (date) return { value: new Date(date.getTime() + IST_OFFSET_MS), format: XLSX_FORMATS.datetime };
    return { value: String(value) };
  }
  if (type === 'money' || type === 'number' || type === 'percent') {
    return typeof value === 'number' && Number.isFinite(value) ? { value, format: XLSX_FORMATS[type] } : { value: String(value) };
  }
  if (typeof value === 'number') return { value };
  if (value instanceof Date) return { value: new Date(value.getTime() + IST_OFFSET_MS), format: XLSX_FORMATS.datetime };
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // A calendar day such as 2026-11-21 becomes a date cell, so it sorts and filters as a date.
  if (DAY_PATTERN.test(text)) {
    const day = new Date(text + 'T00:00:00Z');
    if (!Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text) return { value: day, format: 'yyyy-mm-dd' };
  }
  // Written as a string cell, never as a formula, so text starting with "=" cannot run.
  return { value: text };
}

function columnWidth(column: ReportColumn, rows: Record<string, any>[]): number {
  let longest = column.label.length;
  for (const row of rows.slice(0, 200)) {
    const value = row[column.key];
    if (isBlank(value)) continue;
    const length = column.type === 'datetime' ? 19 : column.type === 'money' ? String(value).length + 4 : String(value).length;
    if (length > longest) longest = length;
  }
  return Math.max(10, Math.min(longest + 2, 48));
}

export async function buildExportXlsx(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mookalaa admin panel';
  workbook.created = input.generatedAt || new Date();

  const sheet = workbook.addWorksheet('Report');
  const bold = { bold: true };

  // Header block: report name, date range, timezone, generated at and by, what the report counts.
  for (const line of exportHeaderLines(input)) {
    const row = sheet.addRow([line.label, line.value]);
    row.getCell(1).font = bold;
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(input.columns.map((column) => column.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  const headerRowNumber = headerRow.number;
  // The column headings (and the header block above them) stay in view while scrolling.
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowNumber }];

  const writeRow = (source: Record<string, any>, totals = false) => {
    const row = sheet.addRow([]);
    input.columns.forEach((column, index) => {
      const raw = source[column.key];
      // The totals row carries a text label ("Total") in a column that may be a date column.
      const type: ColumnType = totals && typeof raw === 'string' ? 'text' : column.type;
      const { value, format } = totals && typeof raw === 'string' ? { value: raw, format: undefined } : xlsxValue(raw, type);
      const cell = row.getCell(index + 1);
      cell.value = value;
      if (format) cell.numFmt = format;
      if (totals) {
        cell.font = bold;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      }
    });
    return row;
  };

  for (const item of input.rows) writeRow(item);
  if (input.totals) writeRow(input.totals, true);

  if (input.summary && input.summary.length) {
    sheet.addRow([]);
    sheet.addRow(['Summary']).getCell(1).font = bold;
    for (const item of input.summary) {
      const row = sheet.addRow([item.label]);
      const { value, format } = xlsxValue(item.value, item.type || 'text');
      row.getCell(2).value = value;
      if (format) row.getCell(2).numFmt = format;
    }
  }

  input.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = columnWidth(column, input.rows);
  });
  // The first column also holds the header labels.
  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width || 10, 26);

  // Second sheet: the definitions behind every figure and the notes for this report.
  const definitions = workbook.addWorksheet('Definitions');
  definitions.getColumn(1).width = 38;
  definitions.getColumn(2).width = 140;
  const section = (title: string) => {
    definitions.addRow([title]).getCell(1).font = bold;
  };
  section('Report');
  for (const line of exportHeaderLines(input)) definitions.addRow([line.label, line.value]);
  definitions.addRow([]);
  section('Status and figure definitions');
  for (const definition of FIGURE_DEFINITIONS) definitions.addRow([definition.term, definition.meaning]);
  if (input.notes && input.notes.length) {
    definitions.addRow([]);
    section('Notes for this report');
    for (const note of input.notes) definitions.addRow(['Note', note]);
  }

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Noto Sans Regular (SIL Open Font License 1.1, see assets/fonts/NotoSans-OFL.txt).
 * PDFKit's built-in fonts have no rupee sign. The path is built from
 * process.cwd() so that it resolves the same way in `next dev`, after
 * `next build` and in a serverless function, and so that the build's file
 * tracing includes the font in the deployed function.
 */
const FONT_FILE = path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf');

let fontBytes: Buffer | null = null;

function loadFont(): Buffer {
  if (!fontBytes) fontBytes = fs.readFileSync(FONT_FILE);
  return fontBytes;
}

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function pdfText(value: any, type: ColumnType): string {
  if (isBlank(value)) return '';
  if (type === 'datetime') return asDate(value) ? istDateTime(value) : String(value);
  if (typeof value === 'number') {
    if (type === 'money') return (value < 0 ? '-₹' : '₹') + inr.format(Math.abs(value));
    if (type === 'percent') return value + '%';
    return whole.format(value);
  }
  if (value instanceof Date) return istDateTime(value);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Ligatures are switched off: with "fi" drawn as one glyph, text copied or
 * searched in the PDF loses those letters in some viewers.
 */
const PLAIN = { liga: false, clig: false, dlig: false } as any;

const COLUMN_WEIGHT: Record<ColumnType, number> = { text: 1.5, datetime: 1.35, money: 1.2, number: 0.8, percent: 0.8 };

export function buildExportPdf(input: ExportInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const font = loadFont();
      const margin = 28;
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: margin, bottom: margin + 14, left: margin, right: margin },
        bufferPages: true,
        // The bundled font is the document font from the first byte, so the
        // built-in Helvetica metrics are never loaded.
        font: font as any,
        info: {
          Title: `${input.name} (${input.rangeLabel})`,
          Author: 'Mookalaa admin panel',
          Creator: 'Mookalaa admin panel',
          CreationDate: input.generatedAt || new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Characters the font has no glyph for (it covers Latin, Greek and
      // Cyrillic and the rupee sign, not Indian scripts) are replaced by "?"
      // rather than printed as empty boxes, and the PDF says so.
      const glyphs = (doc as any)._font?.font;
      let replaced = false;
      const clean = (text: string): string => {
        if (!glyphs || typeof glyphs.hasGlyphForCodePoint !== 'function') return text;
        let out = '';
        for (const char of text) {
          const code = char.codePointAt(0) as number;
          if (code === 10 || code === 13 || code === 9) out += ' ';
          else if (code < 32) continue;
          else if (glyphs.hasGlyphForCodePoint(code)) out += char;
          else {
            out += '?';
            replaced = true;
          }
        }
        return out;
      };

      const left = margin;
      const width = doc.page.width - margin * 2;
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const ink = '#1f2937';
      const muted = '#6b7280';

      /* ---------------- header block ---------------- */
      doc.fillColor('#1e3a5f').fontSize(15).text(clean(input.name), left, margin, { width, features: PLAIN });
      doc.moveDown(0.3);
      const labelWidth = 215;
      const pair = (label: string, value: string, size = 8) => {
        doc.fontSize(size);
        const height = Math.max(
          doc.heightOfString(clean(label), { width: labelWidth - 8, features: PLAIN }),
          doc.heightOfString(clean(value), { width: width - labelWidth, features: PLAIN })
        );
        if (doc.y + height > bottom()) doc.addPage();
        const y = doc.y;
        doc.fillColor(muted).text(clean(label), left, y, { width: labelWidth - 8, features: PLAIN });
        doc.fillColor(ink).text(clean(value), left + labelWidth, y, { width: width - labelWidth, features: PLAIN });
        doc.y = y + height + 2;
      };
      for (const line of exportHeaderLines(input).slice(1)) pair(line.label, line.value);
      for (const item of input.summary || []) pair('Summary: ' + item.label, pdfText(item.value, item.type || 'text'));
      doc.y += 6;

      /* ---------------- table ---------------- */
      const allRows = input.rows;
      const rows = allRows.length > PDF_MAX_ROWS ? allRows.slice(0, PDF_MAX_ROWS) : allRows;
      const columns = input.columns;
      const totalWeight = columns.reduce((sum, column) => sum + COLUMN_WEIGHT[column.type], 0) || 1;
      const widths = columns.map((column) => (COLUMN_WEIGHT[column.type] / totalWeight) * width);
      const fontSize = columns.length > 12 ? 5.6 : columns.length > 9 ? 6.2 : 7.2;
      const pad = 2.5;
      const alignOf = (column: ReportColumn) => (column.type === 'text' || column.type === 'datetime' ? 'left' : 'right');

      const drawRow = (cells: string[], options: { header?: boolean; totals?: boolean } = {}) => {
        doc.fontSize(fontSize);
        let height = 0;
        cells.forEach((cell, index) => {
          const h = doc.heightOfString(cell || ' ', { width: widths[index] - pad * 2, features: PLAIN });
          if (h > height) height = h;
        });
        height += pad * 2;
        if (!options.header && doc.y + height > bottom()) {
          doc.addPage();
          doc.y = margin;
          drawRow(columns.map((column) => clean(column.label)), { header: true });
          doc.fontSize(fontSize);
        }
        const y = doc.y;
        if (options.header) doc.rect(left, y, width, height).fill('#1e3a5f');
        else if (options.totals) doc.rect(left, y, width, height).fill('#e5e7eb');
        let x = left;
        cells.forEach((cell, index) => {
          doc
            .fillColor(options.header ? '#ffffff' : ink)
            .text(cell, x + pad, y + pad, { width: widths[index] - pad * 2, align: alignOf(columns[index]) as any, features: PLAIN });
          x += widths[index];
        });
        if (!options.header) {
          doc
            .moveTo(left, y + height)
            .lineTo(left + width, y + height)
            .lineWidth(options.totals ? 0.8 : 0.3)
            .strokeColor(options.totals ? '#374151' : '#d1d5db')
            .stroke();
        }
        doc.y = y + height;
      };

      if (doc.y + 40 > bottom()) {
        doc.addPage();
        doc.y = margin;
      }
      drawRow(columns.map((column) => clean(column.label)), { header: true });
      if (rows.length === 0) {
        doc.fontSize(8).fillColor(muted).text('There are no source records for this report in the chosen date range.', left, doc.y + 6, { width, features: PLAIN });
        doc.y += 6;
      }
      for (const row of rows) drawRow(columns.map((column) => clean(pdfText(row[column.key], column.type))));
      if (input.totals) {
        drawRow(
          columns.map((column) => {
            const value = input.totals![column.key];
            return clean(pdfText(value, typeof value === 'string' ? 'text' : column.type));
          }),
          { totals: true }
        );
      }

      /* ---------------- notes and definitions ---------------- */
      doc.y += 10;
      const heading = (text: string) => {
        doc.fontSize(9);
        if (doc.y + 30 > bottom()) {
          doc.addPage();
          doc.y = margin;
        }
        doc.fillColor('#1e3a5f').text(text, left, doc.y, { width, features: PLAIN });
        doc.y += 2;
      };
      const notes = [...(input.notes || [])];
      if (allRows.length > rows.length) {
        notes.push(
          `This PDF lists the first ${rows.length} of ${allRows.length} rows. The total row covers every row. Use the Excel or CSV export for the full list.`
        );
      }
      // Reserve the wording now; whether it is needed is only known once all text has been drawn.
      const replacedNote =
        "Characters that the PDF font does not contain (for example text in Indian scripts) are printed as '?'. The Excel and CSV exports keep the original text.";
      if (notes.length) {
        heading('Notes for this report');
        for (const note of notes) pair('Note', note, 7.5);
      }
      doc.y += 6;
      heading('Status and figure definitions');
      for (const definition of FIGURE_DEFINITIONS) pair(definition.term, definition.meaning, 7.5);
      if (replaced) pair('Note', replacedNote, 7.5);

      /* ---------------- page footers ---------------- */
      const range = doc.bufferedPageRange();
      const footer = clean(`${input.name} | ${input.rangeLabel} | ${REPORT_TIMEZONE_LABEL} | Generated ${istDateTime(input.generatedAt || new Date())} IST`);
      for (let index = 0; index < range.count; index++) {
        doc.switchToPage(range.start + index);
        // Text below the bottom margin would otherwise start a new page.
        const saved = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = doc.page.height - margin - 4;
        doc.fontSize(7).fillColor(muted);
        doc.text(footer, left, y, { width: width - 90, lineBreak: false, ellipsis: true, height: 10, features: PLAIN });
        doc.text(`Page ${index + 1} of ${range.count}`, left + width - 90, y, { width: 90, align: 'right', lineBreak: false, features: PLAIN });
        doc.page.margins.bottom = saved;
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/* ------------------------------------------------------------------ */
/* One entry point                                                     */
/* ------------------------------------------------------------------ */

export interface BuiltFile {
  bytes: Buffer;
  contentType: string;
  extension: ExportFormat;
}

export async function buildExportFile(format: ExportFormat, input: ExportInput): Promise<BuiltFile> {
  if (format === 'xlsx') return { bytes: await buildExportXlsx(input), contentType: CONTENT_TYPES.xlsx, extension: 'xlsx' };
  if (format === 'pdf') return { bytes: await buildExportPdf(input), contentType: CONTENT_TYPES.pdf, extension: 'pdf' };
  // The byte-order mark makes Excel read the CSV as UTF-8.
  return { bytes: Buffer.from('﻿' + buildExportCsv(input), 'utf8'), contentType: CONTENT_TYPES.csv, extension: 'csv' };
}

/** A download that is never cached and never sniffed as another type. */
export function fileDownload(bytes: Buffer, filename: string, contentType: string, extraHeaders: Record<string, string> = {}) {
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, '-');
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}
