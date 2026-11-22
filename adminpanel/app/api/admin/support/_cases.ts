import type { Db } from 'mongodb';
import type { NextRequest } from 'next/server';
import { logAudit } from '@/lib/audit';
import { escapeRegex, toObjectId } from '@/lib/http';
import { addDays, istDay, startOfIstDay } from '@/lib/reporting';
import type { AdminIdentity } from '@/lib/permissions';
import {
  CASE_PRIORITIES,
  CASE_SERVICES,
  CASE_STATUSES,
  OPEN_CASE_STATUSES,
  caseResourceName,
} from '@/lib/resources/support';
import { evaluateSla, isTeam, last10, phoneForms, type SlaSettings } from '@/lib/resources/support.hooks';

/** Shared by the /api/admin/support/** routes. Server only. */

export const CASES = 'supportCases';

/** The audit log `module` and `entityType` of a case, so the generic history and ours are one. */
export async function auditCase(input: {
  admin: AdminIdentity | null;
  doc: any;
  action: string;
  before?: any;
  after?: any;
  reason?: string | null;
  request?: NextRequest;
  meta?: Record<string, any>;
}) {
  await logAudit({
    admin: input.admin,
    action: input.action,
    module: 'support',
    entityType: caseResourceName(input.doc?.kind),
    entityId: String(input.doc?._id),
    entityLabel: String(input.doc?.subject || input.doc?._id || ''),
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason || null,
    request: input.request,
    meta: input.meta,
  });
}

export async function loadCase(db: Db, id: string) {
  const oid = toObjectId(id);
  if (!oid) return null;
  return db.collection(CASES).findOne({ _id: oid });
}

function iso(value: any): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clockOut(c: ReturnType<typeof evaluateSla>['response']) {
  return { ...c, dueAt: iso(c.dueAt) };
}

/** One row of a case list. Internal notes are never included here. */
export function caseRow(doc: any, sla: SlaSettings, now: Date) {
  const evaluated = evaluateSla(doc, sla, now);
  return {
    _id: String(doc._id),
    kind: doc.kind === 'complaint' ? 'complaint' : 'ticket',
    subject: doc.subject || '',
    customerName: doc.customerName || '',
    customerPhone: doc.customerPhone || '',
    service: doc.service || '',
    priority: doc.priority || '',
    status: doc.status || '',
    source: doc.source || 'admin',
    assignedTeam: isTeam(doc.assignedTeam) ? doc.assignedTeam : null,
    assignedTo: doc.assignedTo || null,
    assignedToId: doc.assignedToId || null,
    assignedToName: doc.assignedToName || null,
    escalated: doc.escalated === true,
    escalationLevel: Number(doc.escalationLevel) || 0,
    bookingId: doc.bookingId || null,
    refundId: doc.refundId || null,
    aboutRefund: doc.aboutRefund === true,
    repliesCount: Array.isArray(doc.replies) ? doc.replies.length : 0,
    notesCount: Array.isArray(doc.notes) ? doc.notes.length : 0,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    firstResponseAt: iso(doc.firstResponseAt),
    responseMinutes: typeof doc.responseMinutes === 'number' ? doc.responseMinutes : null,
    resolvedAt: iso(doc.resolvedAt),
    resolutionMinutes: typeof doc.resolutionMinutes === 'number' ? doc.resolutionMinutes : null,
    sla: { response: clockOut(evaluated.response), resolution: clockOut(evaluated.resolution) },
  };
}

/**
 * The list filter from the query string. Every value is checked against its
 * allowed values, so nothing from the request reaches Mongo as an operator.
 *   kind      complaint | ticket          (omitted: both)
 *   mine      1: cases assigned to the signed-in admin
 *   status    a case status, or 'active' (every open status)
 *   priority, service, source, team ('unassigned' for none)
 *   escalated 1
 *   q         subject, customer name or phone, booking or refund id
 *   from, to  created on or after / before (ISO dates)
 */
export function caseFilter(params: URLSearchParams, admin: AdminIdentity, options: { ignoreStatus?: boolean } = {}) {
  const filter: Record<string, any> = {};
  const and: Record<string, any>[] = [];
  const kind = params.get('kind');
  if (kind === 'complaint' || kind === 'ticket') filter.kind = kind;
  if (params.get('mine') === '1') filter.assignedToId = admin.id || '__none__';

  const status = params.get('status') || '';
  if (!options.ignoreStatus) {
    if (status === 'active') filter.status = { $in: OPEN_CASE_STATUSES };
    else if (CASE_STATUSES.some((s) => s.value === status)) filter.status = status;
  }
  const priority = params.get('priority') || '';
  if (CASE_PRIORITIES.some((p) => p.value === priority)) filter.priority = priority;
  const service = params.get('service') || '';
  if (CASE_SERVICES.some((s) => s.value === service)) filter.service = service;
  const source = params.get('source') || '';
  if (source === 'app') filter.source = 'app';
  if (source === 'admin') and.push({ source: { $ne: 'app' } });
  const team = params.get('team') || '';
  if (isTeam(team)) filter.assignedTeam = team;
  if (team === 'unassigned') and.push({ $or: [{ assignedTeam: null }, { assignedTeam: { $exists: false } }, { assignedTeam: '' }] });
  if (params.get('escalated') === '1') filter.escalated = true;

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const or: Record<string, any>[] = [{ subject: regex }, { customerName: regex }, { customerPhone: regex }, { bookingId: q }, { refundId: q }];
    if (/^\+?\d{10,13}$/.test(q)) or.push({ customerPhone: { $in: phoneForms(q) } });
    and.push({ $or: or });
  }
  const range = dayRange(params);
  if (range && typeof range !== 'string') filter.createdAt = { $gte: range.start, $lt: range.end };
  if (and.length) filter.$and = and;
  return filter;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `from` / `to` as whole days in IST (YYYY-MM-DD, both included). Null when
 * neither is given (all time); a message when a date is not usable.
 */
export function dayRange(params: URLSearchParams): { from: string; to: string; start: Date; end: Date; label: string } | null | string {
  const from = (params.get('from') || '').trim();
  const to = (params.get('to') || '').trim();
  if (!from && !to) return null;
  for (const day of [from, to]) {
    if (!day) continue;
    const parsed = new Date(day + 'T00:00:00Z');
    // A real calendar day only: 2026-02-31 would otherwise roll over into March.
    if (!DAY.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
      return 'Dates must be real days written as YYYY-MM-DD.';
    }
  }
  const first = from || '2000-01-01';
  const last = to || istDay();
  if (first > last) return 'The start date is after the end date.';
  return {
    from: first,
    to: last,
    start: startOfIstDay(first),
    end: startOfIstDay(addDays(last, 1)),
    label: `${from || 'the first case'} to ${to || 'today'}`,
  };
}

/** The customer's account, when one exists for the case's phone. */
export async function customerAccount(db: Db, phone: unknown) {
  if (!last10(phone)) return null;
  const user = await db
    .collection('users')
    .findOne({ phone: { $in: phoneForms(phone) } }, { projection: { name: 1, email: 1, phone: 1, accountStatus: 1, isActive: 1 } });
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    accountStatus: user.accountStatus || (user.isActive === false ? 'suspended' : 'active'),
  };
}
