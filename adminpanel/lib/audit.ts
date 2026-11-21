import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { clientIp } from './auth';
import type { AdminIdentity } from './permissions';

export interface AuditEntry {
  admin: AdminIdentity | null;
  /** Short verb, e.g. "create", "update", "status_change", "delete", "login". */
  action: string;
  /** Permission module the change belongs to, e.g. "finance". */
  module: string;
  entityType: string;
  entityId?: string | null;
  /** Human readable label of the record, e.g. a user's name. */
  entityLabel?: string | null;
  before?: any;
  after?: any;
  reason?: string | null;
  request?: NextRequest;
  meta?: Record<string, any>;
}

const SECRET_KEYS = /password|secret|otp|token|aadhar|^pan(id|image|number)?$|twoFactorSecret|apiKey|serverKey/i;
const BULKY_KEYS = /image|media|photo|logo|banner|file|document/i;

/** Removes secrets and large binary payloads before a value is written to the log. */
export function sanitiseForAudit(value: any, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[nested]';
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    if (value.length > 50) return `[${value.length} items]`;
    return value.map((v) => sanitiseForAudit(v, depth + 1));
  }
  if (typeof value === 'object') {
    if (typeof (value as any).toHexString === 'function') return String(value);
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(key)) {
        out[key] = v ? '[hidden]' : v;
      } else if (typeof v === 'string' && (v.length > 500 || (BULKY_KEYS.test(key) && v.startsWith('data:')))) {
        out[key] = `[${v.length} characters]`;
      } else {
        out[key] = sanitiseForAudit(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Only the fields that differ between two records. */
export function diff(before: any, after: any): { before: Record<string, any>; after: Record<string, any> } {
  const b: Record<string, any> = {};
  const a: Record<string, any> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (key === 'updatedAt' || key === 'updatedBy') continue;
    const left = before?.[key];
    const right = after?.[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      b[key] = left;
      a[key] = right;
    }
  }
  return { before: b, after: a };
}

/**
 * Writes one entry to the Admin Activity Log. A logging failure is reported to
 * the server log but never blocks the action that triggered it.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { db } = await connectToDatabase();
    await db.collection('auditLogs').insertOne({
      adminId: entry.admin?.id || null,
      adminEmail: entry.admin?.email || null,
      adminName: entry.admin?.name || null,
      adminRole: entry.admin?.role || null,
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : null,
      entityLabel: entry.entityLabel || null,
      before: sanitiseForAudit(entry.before ?? null),
      after: sanitiseForAudit(entry.after ?? null),
      reason: entry.reason || null,
      meta: sanitiseForAudit(entry.meta ?? null),
      ip: entry.request ? clientIp(entry.request) : null,
      userAgent: entry.request?.headers.get('user-agent') || null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to write audit log entry:', error);
  }
}
