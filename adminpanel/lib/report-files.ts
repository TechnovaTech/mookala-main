import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { Binary, ObjectId, type Db } from 'mongodb';
import { logAudit } from './audit';
import { can, type AdminIdentity } from './permissions';
import { buildExportFile } from './report-export';
import { exportFilename, exportInputFor, lastCompletedPeriod, nextRunDue, runReport, type DateRange } from './reporting';
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  REPORT_CATALOG,
  getReportInfo,
  isExportFormat,
  type ExportFormat,
} from './resources/reports';

/**
 * Generated report files (requirements 10.3: "scheduled report generation and
 * secure exports").
 *
 * A generated file is stored in MongoDB, in the `reportFiles` collection, with
 * its bytes in one binary field. It is never written to a public folder or a
 * public URL: the only way to read it is the download route, which checks the
 * admin session and the permissions of the report the file contains, and
 * records the download in the activity log. Files are deleted when they pass
 * their expiry date.
 *
 * Schedules ("Run now" and the hourly scheduler) both generate their files
 * through `runSchedule` below, so they cannot drift apart.
 */

export const REPORT_FILES = 'reportFiles';

/** Largest file that is stored. A MongoDB document holds at most 16 MB. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** The identity written to the activity log when the scheduler acts. */
export const SYSTEM_ACTOR: AdminIdentity = { name: 'Scheduler (system)', email: 'system', role: 'system' };

export type FileTrigger = 'manual' | 'run_now' | 'schedule';

export class ReportFileError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

/** Permissions needed to read a file of a report type. A type that no longer exists is closed to all but full finance access. */
export function permissionsForReport(reportType: string): string[] {
  return getReportInfo(reportType)?.permissions || ['reports:manage', 'finance:manage'];
}

export function canReadReport(admin: AdminIdentity | null | undefined, reportType: string): boolean {
  return Boolean(admin) && permissionsForReport(reportType).every((permission) => can(admin, permission));
}

/** The report types whose files this admin may see. */
export function readableReportTypes(admin: AdminIdentity): string[] {
  return REPORT_CATALOG.filter((report) => canReadReport(admin, report.key)).map((report) => report.key);
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

function validDays(value: unknown): number | null {
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) return null;
  return days;
}

/**
 * Days a generated file is kept. Set on the Generated Files screen (stored in
 * the `settings` document of type 'reports'); the REPORT_FILE_RETENTION_DAYS
 * environment variable is the default when nothing has been saved there.
 */
export async function getRetentionDays(db: Db): Promise<number> {
  const settings = await db.collection('settings').findOne({ type: 'reports' }, { projection: { fileRetentionDays: 1 } });
  return validDays(settings?.fileRetentionDays) ?? validDays(process.env.REPORT_FILE_RETENTION_DAYS) ?? DEFAULT_RETENTION_DAYS;
}

/** Saves the retention period and moves the expiry date of every stored file to match it. */
export async function setRetentionDays(db: Db, value: unknown, admin: AdminIdentity): Promise<{ before: number; after: number } | string> {
  const days = validDays(value);
  if (days === null) return `Retention must be a whole number of days from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS}.`;
  const before = await getRetentionDays(db);
  const now = new Date();
  await db.collection('settings').updateOne(
    { type: 'reports' },
    { $set: { fileRetentionDays: days, updatedAt: now, updatedBy: admin.email || null }, $setOnInsert: { type: 'reports', createdAt: now } },
    { upsert: true }
  );
  await db
    .collection(REPORT_FILES)
    .updateMany({}, [{ $set: { expiresAt: { $add: ['$createdAt', days * 86_400_000] }, retentionDays: days } }]);
  return { before, after: days };
}

/**
 * Deletes files that have passed their expiry date. Called whenever files are
 * listed or downloaded and on every scheduler run, so an expired file can
 * never be served. Each purge is written to the activity log as the system.
 */
export async function purgeExpiredFiles(db: Db, now: Date = new Date()): Promise<number> {
  const collection = db.collection(REPORT_FILES);
  const expired = await collection
    .find({ expiresAt: { $lte: now } }, { projection: { name: 1, reportType: 1, period: 1, format: 1, sha256: 1, createdAt: 1, expiresAt: 1 } })
    .limit(500)
    .toArray();
  if (expired.length === 0) return 0;

  const result = await collection.deleteMany({ _id: { $in: expired.map((file) => file._id) }, expiresAt: { $lte: now } });
  if (result.deletedCount > 0) {
    await logAudit({
      admin: SYSTEM_ACTOR,
      action: 'delete',
      module: 'reports',
      entityType: 'report-file',
      entityLabel: `${result.deletedCount} expired report file${result.deletedCount === 1 ? '' : 's'}`,
      reason: 'Retention period passed',
      meta: {
        deleted: result.deletedCount,
        files: expired.slice(0, 50).map((file) => ({ id: String(file._id), name: file.name, sha256: file.sha256, expiresAt: file.expiresAt })),
      },
    });
  }
  return result.deletedCount;
}

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

const globalForFiles = global as unknown as { _reportFileIndexes?: Promise<void> };

function ensureFileIndexes(db: Db): Promise<void> {
  if (!globalForFiles._reportFileIndexes) {
    globalForFiles._reportFileIndexes = (async () => {
      try {
        await db.collection(REPORT_FILES).createIndex({ createdAt: -1 });
        await db.collection(REPORT_FILES).createIndex({ expiresAt: 1 });
        await db.collection('scheduledReports').createIndex({ status: 1, nextRunAt: 1 });
      } catch (error) {
        console.error('Could not create the report file indexes:', error);
      }
    })();
  }
  return globalForFiles._reportFileIndexes;
}

/* ------------------------------------------------------------------ */
/* Generating and storing                                              */
/* ------------------------------------------------------------------ */

export interface StoredFile {
  _id: ObjectId;
  name: string;
  reportType: string;
  reportName: string;
  period: string;
  periodFrom: string | null;
  periodTo: string | null;
  format: ExportFormat;
  contentType: string;
  size: number;
  sha256: string;
  rows: number;
  totalRows: number;
  generatedBy: string;
  trigger: FileTrigger;
  scheduleId: string | null;
  scheduleName: string | null;
  createdAt: Date;
  expiresAt: Date;
  retentionDays: number;
  downloads: number;
}

export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** The fields of a stored file that are safe to list: everything except the bytes. */
export const FILE_LIST_PROJECTION = { data: 0 } as const;

export interface GenerateInput {
  reportType: string;
  range: DateRange;
  format: ExportFormat;
  /** Email of the admin, or 'schedule' when the scheduler generated the file. */
  generatedBy: string;
  trigger: FileTrigger;
  schedule?: { _id: ObjectId; name?: string; frequency?: string } | null;
}

/**
 * Builds one report for a period in one format and stores the file. The
 * caller is responsible for the permission check and for the audit entry.
 */
export async function generateAndStoreReport(db: Db, input: GenerateInput): Promise<StoredFile> {
  const info = getReportInfo(input.reportType);
  if (!info) throw new ReportFileError('This report no longer exists.', 409);
  await ensureFileIndexes(db);

  const report = await runReport(db, info.key, input.range, true);
  if (!report) throw new ReportFileError('Could not build the report.', 500);

  const filters = input.schedule
    ? [{ label: 'Schedule', value: `${input.schedule.name || ''} (${input.schedule.frequency || ''})`.trim() }]
    : undefined;
  const built = await buildExportFile(input.format, exportInputFor(report, input.generatedBy === 'schedule' ? 'Scheduler (system)' : input.generatedBy, filters));
  if (built.bytes.length > MAX_FILE_BYTES) {
    throw new ReportFileError(
      `The file is ${(built.bytes.length / 1048576).toFixed(1)} MB, which is over the ${MAX_FILE_BYTES / 1048576} MB limit for stored files. Choose a shorter date range or the CSV format.`,
      413
    );
  }

  const retentionDays = await getRetentionDays(db);
  const createdAt = new Date();
  const doc = {
    name: exportFilename(report.name, report.rangeLabel, built.extension),
    reportType: info.key,
    reportName: report.name,
    period: report.rangeLabel,
    periodFrom: info.usesDateRange ? input.range.from : null,
    periodTo: info.usesDateRange ? input.range.to : null,
    format: built.extension,
    contentType: built.contentType,
    size: built.bytes.length,
    sha256: sha256Hex(built.bytes),
    rows: report.rows.length,
    totalRows: report.totalRows,
    generatedBy: input.generatedBy,
    trigger: input.trigger,
    scheduleId: input.schedule ? String(input.schedule._id) : null,
    scheduleName: input.schedule?.name || null,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + retentionDays * 86_400_000),
    retentionDays,
    downloads: 0,
  };
  const result = await db.collection(REPORT_FILES).insertOne({ ...doc, data: new Binary(built.bytes) });
  return { ...doc, _id: result.insertedId };
}

/** Reads the bytes of a stored file and checks them against the stored hash. */
export function fileBytes(file: any): Buffer {
  const data = file?.data;
  const bytes: Buffer | null = data
    ? Buffer.isBuffer(data)
      ? data
      : data.buffer
        ? Buffer.from(data.buffer)
        : null
    : null;
  if (!bytes) throw new ReportFileError('The stored file has no content.', 500);
  if (sha256Hex(bytes) !== file.sha256) throw new ReportFileError('The stored file does not match its recorded checksum and was not served.', 500);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Schedules                                                           */
/* ------------------------------------------------------------------ */

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
/** Hourly attempts for one period before the scheduler gives up on it. */
const MAX_RETRIES = 6;

export function scheduleFrequency(schedule: any): string {
  return FREQUENCIES.includes(schedule?.frequency) ? schedule.frequency : 'monthly';
}

export function scheduleFormat(schedule: any): ExportFormat {
  return isExportFormat(schedule?.format) ? schedule.format : 'csv';
}

export interface RunOutcome {
  file: StoredFile;
  rangeLabel: string;
}

/**
 * Generates the report of a schedule for its last completed period, stores the
 * file, records the run on the schedule and writes the audit entry. Used by
 * "Run now" (with the admin who clicked) and by the scheduler (admin = null,
 * recorded as the system).
 */
export async function runSchedule(
  db: Db,
  schedule: any,
  options: { admin: AdminIdentity | null; trigger: 'run_now' | 'schedule'; now?: Date; request?: NextRequest }
): Promise<RunOutcome> {
  const now = options.now || new Date();
  const frequency = scheduleFrequency(schedule);
  const format = scheduleFormat(schedule);
  const range = lastCompletedPeriod(frequency, now);
  const actor = options.admin || SYSTEM_ACTOR;
  const runBy = options.admin ? options.admin.email || 'admin' : 'schedule';

  try {
    const file = await generateAndStoreReport(db, {
      reportType: String(schedule.reportType || ''),
      range,
      format,
      generatedBy: runBy,
      trigger: options.trigger,
      schedule: { _id: schedule._id, name: schedule.name, frequency },
    });

    const finished = new Date();
    await db.collection('scheduledReports').updateOne(
      { _id: schedule._id },
      {
        $set: {
          lastRunAt: finished,
          lastRunBy: runBy,
          lastRunPeriod: range.label,
          lastRunStatus: 'Generated',
          lastRunError: null,
          lastRunFileId: String(file._id),
          failedAttempts: 0,
          nextRunAt: nextRunDue(frequency, now),
          updatedAt: finished,
        },
        $unset: { runningSince: '' },
      }
    );

    await logAudit({
      admin: actor,
      action: 'export',
      module: 'reports',
      entityType: 'scheduled-reports',
      entityId: String(schedule._id),
      entityLabel: schedule.name || file.reportName,
      meta: {
        trigger: options.trigger,
        report: file.reportType,
        dateRange: file.period,
        format: file.format,
        rows: file.rows,
        fileId: String(file._id),
        fileName: file.name,
        size: file.size,
        sha256: file.sha256,
        expiresAt: file.expiresAt,
        emailed: false,
      },
      request: options.request,
    });

    return { file, rangeLabel: range.label };
  } catch (error: any) {
    const message = error instanceof ReportFileError ? error.message : 'The report could not be generated.';
    await db.collection('scheduledReports').updateOne(
      { _id: schedule._id },
      {
        $set: { lastRunStatus: 'Failed', lastRunError: message, lastAttemptAt: new Date(), updatedAt: new Date() },
        $inc: { failedAttempts: 1 },
        $unset: { runningSince: '' },
      }
    );
    await logAudit({
      admin: actor,
      action: 'export_failed',
      module: 'reports',
      entityType: 'scheduled-reports',
      entityId: String(schedule._id),
      entityLabel: schedule.name || String(schedule.reportType || ''),
      meta: { trigger: options.trigger, report: schedule.reportType, dateRange: range.label, format, error: message },
      request: options.request,
    });
    throw error;
  }
}

export interface DueRunSummary {
  checkedAt: string;
  due: number;
  generated: { scheduleId: string; name: string; report: string; period: string; format: string; fileId: string }[];
  failed: { scheduleId: string; name: string; error: string }[];
  skipped: number;
  expiredFilesDeleted: number;
}

/**
 * Runs every active schedule whose period has completed. Each schedule is
 * claimed first (its next run is moved forward in one atomic update), so two
 * overlapping scheduler calls never generate the same file twice. A schedule
 * that fails gets its due time back and is tried again on the next call,
 * up to MAX_RETRIES times for one period.
 */
export async function runDueSchedules(db: Db, now: Date = new Date(), options: { limit?: number; budgetMs?: number } = {}): Promise<DueRunSummary> {
  await ensureFileIndexes(db);
  const started = Date.now();
  const limit = options.limit ?? 25;
  const budgetMs = options.budgetMs ?? 45_000;

  const summary: DueRunSummary = { checkedAt: now.toISOString(), due: 0, generated: [], failed: [], skipped: 0, expiredFilesDeleted: 0 };
  summary.expiredFilesDeleted = await purgeExpiredFiles(db, now);

  const schedules = db.collection('scheduledReports');
  const due = await schedules
    .find({ status: 'active', $or: [{ nextRunAt: { $lte: now } }, { nextRunAt: null }] })
    .sort({ nextRunAt: 1 })
    .limit(limit)
    .toArray();
  summary.due = due.length;

  for (const schedule of due) {
    if (Date.now() - started > budgetMs) {
      // Out of time for this call: the rest stay due and run on the next one.
      summary.skipped += 1;
      continue;
    }
    const frequency = scheduleFrequency(schedule);
    const claimed = await schedules.findOneAndUpdate(
      { _id: schedule._id, status: 'active', nextRunAt: schedule.nextRunAt ?? null },
      { $set: { nextRunAt: nextRunDue(frequency, now), runningSince: new Date() } }
    );
    const claimedDoc = claimed && typeof claimed === 'object' && 'value' in (claimed as any) ? (claimed as any).value : claimed;
    if (!claimedDoc) {
      summary.skipped += 1;
      continue;
    }

    try {
      const outcome = await runSchedule(db, schedule, { admin: null, trigger: 'schedule', now });
      summary.generated.push({
        scheduleId: String(schedule._id),
        name: schedule.name || '',
        report: outcome.file.reportType,
        period: outcome.file.period,
        format: outcome.file.format,
        fileId: String(outcome.file._id),
      });
    } catch (error: any) {
      console.error('Scheduled report failed:', error);
      // Give the due time back so the next call tries again. After several
      // failures in a row the schedule waits for its next period instead.
      if ((Number(schedule.failedAttempts) || 0) + 1 < MAX_RETRIES) {
        await schedules.updateOne({ _id: schedule._id }, { $set: { nextRunAt: schedule.nextRunAt ?? now } });
      }
      summary.failed.push({
        scheduleId: String(schedule._id),
        name: schedule.name || '',
        error: error instanceof ReportFileError ? error.message : 'The report could not be generated.',
      });
    }
  }

  return summary;
}
