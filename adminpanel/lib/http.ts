import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

export function ok(data: Record<string, any> = {}, init?: ResponseInit) {
  return NextResponse.json({ success: true, ...data }, init);
}

export function fail(error: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Returns an ObjectId, or null when the value is not a valid 24-character id. */
export function toObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' && !(value instanceof ObjectId)) return null;
  return ObjectId.isValid(value as any) && String(value).length === 24 ? new ObjectId(value as any) : null;
}

/**
 * Bookings were historically stored with either an ObjectId or a client-made
 * string as `_id`. This builds a filter that matches both.
 */
export function idFilter(value: string): Record<string, any> {
  const oid = toObjectId(value);
  return oid ? { _id: { $in: [oid, value] } } : { _id: value };
}

/** Escapes text so it can be used inside a RegExp without changing its meaning. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Accepts only plain strings from a request body, to block Mongo operator injection. */
export function asString(value: unknown, max = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Parses an amount stored as a number or as text such as "₹1,500.00". */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  // "₹500.00.00" style values keep only the first decimal point.
  const firstDot = cleaned.indexOf('.');
  const normalised =
    firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  const parsed = parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const cell = (value: any) => {
    if (value === null || value === undefined) return '';
    let text: string;
    if (value instanceof Date) text = value.toISOString();
    else if (typeof value === 'object') text = JSON.stringify(value);
    else text = String(value);
    // Neutralise spreadsheet formula injection, but leave plain negative numbers alone.
    if (/^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };

  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}

export function csvResponse(csv: string, filename: string) {
  return new NextResponse('﻿' + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
