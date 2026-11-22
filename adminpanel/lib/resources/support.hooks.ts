/**
 * Server-side behaviour of customer support and reputation (requirements
 * section 12): case timing (first response, resolution), SLA targets and their
 * evaluation, assignment to authorised teams, escalation, links to bookings
 * and refunds, and the rating aggregates. Server only.
 *
 * Case timing
 *   firstResponseAt   the first moment the case left 'open', received an
 *                     internal note or received a reply to the customer.
 *                     `responseMinutes` = minutes from createdAt to it.
 *   resolvedAt        the moment the case became 'resolved' (or 'closed'
 *                     without having been resolved). Cleared when the case is
 *                     reopened. `resolutionMinutes` = minutes from createdAt.
 *   Minutes are stored with two decimals.
 *
 * SLA targets live in the settings document { type: 'support' }:
 *   sla.<priority>.responseHours / resolutionHours (null = no target).
 * They are empty until an admin with support:manage sets them. Whether a case
 * is within or past its target is computed on every read, against the case's
 * current priority, and is never stored.
 */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { can, normaliseRole, ROLES, type AdminIdentity } from '../permissions';
import { escapeRegex, toObjectId } from '../http';
import { findBooking } from '../bookings';
import {
  CASE_TEAMS,
  DONE_CASE_STATUSES,
  OPEN_CASE_STATUSES,
  PRIORITY_ORDER,
  caseResourceName,
} from './support';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export const MIN_REASON = 5;

/** The last ten digits of a phone number, for comparing numbers stored with or without +91. */
export function last10(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** The forms a phone number is stored in across the collections. */
export function phoneForms(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  const ten = last10(raw);
  return Array.from(new Set([raw, ten, '+91' + ten, '91' + ten].filter(Boolean)));
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Minutes between two moments, two decimals, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round(((to.getTime() - from.getTime()) / 60000) * 100) / 100);
}

export const TEAM_VALUES = CASE_TEAMS.map((t) => t.value);

export function isTeam(value: unknown): value is string {
  return typeof value === 'string' && TEAM_VALUES.includes(value);
}

export function teamLabel(value: unknown): string {
  return CASE_TEAMS.find((t) => t.value === value)?.label || 'Unassigned';
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

export type ResponseKind = 'status' | 'note' | 'reply';

/** Fields that record the first response, or {} when the case already has one. */
export function firstResponseFields(existing: any, at: Date, by: string | null, how: ResponseKind): Record<string, any> {
  if (asDate(existing?.firstResponseAt)) return {};
  const created = asDate(existing?.createdAt) || at;
  return { firstResponseAt: at, firstResponseBy: by, firstResponseType: how, responseMinutes: minutesBetween(created, at) };
}

/** Timing fields that a status change sets or clears. */
export function statusTimingFields(existing: any, from: string, to: string, at: Date, by: string | null): Record<string, any> {
  const out: Record<string, any> = {};
  const created = asDate(existing?.createdAt) || at;

  if (from === 'open' && to !== 'open') Object.assign(out, firstResponseFields(existing, at, by, 'status'));

  const reopening = DONE_CASE_STATUSES.includes(from) && OPEN_CASE_STATUSES.includes(to);
  if (reopening) {
    out.resolvedAt = null;
    out.resolvedBy = null;
    out.resolutionMinutes = null;
    out.reopenedAt = at;
    out.reopenCount = (Number(existing?.reopenCount) || 0) + 1;
  } else if (DONE_CASE_STATUSES.includes(to) && !asDate(existing?.resolvedAt)) {
    out.resolvedAt = at;
    out.resolvedBy = by;
    out.resolutionMinutes = minutesBetween(created, at);
  }
  return out;
}

/**
 * Records timing that the stored records prove but the case does not have
 * yet: cases worked before timing existed, and internal notes added through
 * the generic resource API (which runs no hook for notes). The evidence is the
 * case's own notes and replies and its audit log entries. A case whose
 * evidence does not exist keeps no value and is shown as "not recorded".
 */
export async function syncCaseTiming(db: Db, cases: any[]): Promise<number> {
  const stamp = (doc: any) => String(asDate(doc.updatedAt)?.getTime() ?? '');
  const candidates = cases.filter((doc) => {
    if (doc.timingCheckedFor && doc.timingCheckedFor === stamp(doc)) return false;
    const hasResponse = Boolean(asDate(doc.firstResponseAt));
    const needsResponse =
      !hasResponse &&
      ((doc.status && doc.status !== 'open') ||
        (Array.isArray(doc.notes) && doc.notes.length > 0) ||
        (Array.isArray(doc.replies) && doc.replies.length > 0));
    const needsResolution = DONE_CASE_STATUSES.includes(doc.status) && !asDate(doc.resolvedAt);
    const needsMinutes =
      (hasResponse && typeof doc.responseMinutes !== 'number') || (asDate(doc.resolvedAt) && typeof doc.resolutionMinutes !== 'number');
    return needsResponse || needsResolution || needsMinutes;
  });
  if (candidates.length === 0) return 0;

  const ids = candidates.map((doc) => String(doc._id));
  const entries = await db
    .collection('auditLogs')
    .find(
      { entityType: { $in: ['complaints', 'support-tickets'] }, entityId: { $in: ids }, action: { $in: ['status_change', 'note', 'reply', 'escalate'] } },
      { projection: { entityId: 1, action: 1, before: 1, after: 1, createdAt: 1, adminEmail: 1 } }
    )
    .sort({ createdAt: 1 })
    .toArray();
  const byCase = new Map<string, any[]>();
  for (const entry of entries) byCase.set(entry.entityId, [...(byCase.get(entry.entityId) || []), entry]);

  let changed = 0;
  for (const doc of candidates) {
    const id = String(doc._id);
    const created = asDate(doc.createdAt);
    const set: Record<string, any> = { timingCheckedFor: stamp(doc) };
    const log = byCase.get(id) || [];

    if (created && !asDate(doc.firstResponseAt)) {
      const moments: { at: Date; by: string | null; how: ResponseKind }[] = [];
      for (const note of Array.isArray(doc.notes) ? doc.notes : []) {
        const at = asDate(note?.at);
        if (at) moments.push({ at, by: note.by || null, how: 'note' });
      }
      for (const reply of Array.isArray(doc.replies) ? doc.replies : []) {
        const at = asDate(reply?.at);
        if (at) moments.push({ at, by: reply.by || null, how: 'reply' });
      }
      for (const entry of log) {
        const at = asDate(entry.createdAt);
        if (!at) continue;
        if (entry.action === 'note') moments.push({ at, by: entry.adminEmail || null, how: 'note' });
        if (entry.action === 'reply') moments.push({ at, by: entry.adminEmail || null, how: 'reply' });
        if ((entry.action === 'status_change' || entry.action === 'escalate') && entry.before?.status === 'open' && entry.after?.status && entry.after.status !== 'open') {
          moments.push({ at, by: entry.adminEmail || null, how: 'status' });
        }
      }
      moments.sort((a, b) => a.at.getTime() - b.at.getTime());
      if (moments[0]) {
        Object.assign(set, {
          firstResponseAt: moments[0].at,
          firstResponseBy: moments[0].by,
          firstResponseType: moments[0].how,
          responseMinutes: minutesBetween(created, moments[0].at),
          timingSource: 'derived',
        });
      }
    } else if (created && asDate(doc.firstResponseAt) && typeof doc.responseMinutes !== 'number') {
      set.responseMinutes = minutesBetween(created, asDate(doc.firstResponseAt)!);
    }

    if (created && DONE_CASE_STATUSES.includes(doc.status) && !asDate(doc.resolvedAt)) {
      let resolvedAt: Date | null = null;
      let resolvedBy: string | null = null;
      for (const entry of log) {
        if (entry.action !== 'status_change') continue;
        const before = entry.before?.status;
        const after = entry.after?.status;
        if (DONE_CASE_STATUSES.includes(before) && OPEN_CASE_STATUSES.includes(after)) {
          resolvedAt = null;
          resolvedBy = null;
        } else if (DONE_CASE_STATUSES.includes(after) && !resolvedAt) {
          resolvedAt = asDate(entry.createdAt);
          resolvedBy = entry.adminEmail || null;
        }
      }
      if (resolvedAt) {
        Object.assign(set, { resolvedAt, resolvedBy, resolutionMinutes: minutesBetween(created, resolvedAt), timingSource: 'derived' });
      }
    } else if (created && asDate(doc.resolvedAt) && typeof doc.resolutionMinutes !== 'number') {
      set.resolutionMinutes = minutesBetween(created, asDate(doc.resolvedAt)!);
    }

    await db.collection('supportCases').updateOne({ _id: doc._id }, { $set: set });
    Object.assign(doc, set);
    if (Object.keys(set).length > 1) changed++;
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* SLA targets                                                         */
/* ------------------------------------------------------------------ */

export const SUPPORT_SETTINGS_TYPE = 'support';
export const MAX_SLA_HOURS = 24 * 365;

export interface SlaTarget {
  responseHours: number | null;
  resolutionHours: number | null;
}

export type SlaSettings = Record<string, SlaTarget>;

export function emptySla(): SlaSettings {
  return Object.fromEntries(PRIORITY_ORDER.map((p) => [p, { responseHours: null, resolutionHours: null }]));
}

function hoursValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : NaN;
}

/** Reads the stored targets; anything unusable counts as "no target". */
export function readSla(doc: any): SlaSettings {
  const out = emptySla();
  const stored = doc?.sla && typeof doc.sla === 'object' ? doc.sla : {};
  for (const priority of PRIORITY_ORDER) {
    const entry = stored[priority] || {};
    for (const key of ['responseHours', 'resolutionHours'] as const) {
      const value = hoursValue(entry[key]);
      out[priority][key] = value !== null && Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return out;
}

export async function getSupportSettings(db: Db) {
  const doc = await db.collection('settings').findOne({ type: SUPPORT_SETTINGS_TYPE });
  return {
    sla: readSla(doc),
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
    configured: Boolean(doc) && PRIORITY_ORDER.some((p) => readSla(doc)[p].responseHours !== null || readSla(doc)[p].resolutionHours !== null),
  };
}

/** Validates targets sent by an admin. Returns the clean targets or an error message. */
export function parseSlaInput(input: unknown): SlaSettings | string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Send the targets as { low: {...}, normal: {...}, high: {...}, urgent: {...} }.';
  const out = emptySla();
  const labels: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
  for (const priority of PRIORITY_ORDER) {
    const entry = (input as any)[priority];
    if (entry === undefined || entry === null) continue;
    if (typeof entry !== 'object' || Array.isArray(entry)) return `${labels[priority]}: send responseHours and resolutionHours.`;
    for (const key of ['responseHours', 'resolutionHours'] as const) {
      const value = hoursValue(entry[key]);
      const name = key === 'responseHours' ? 'hours to first response' : 'hours to resolution';
      if (value === null) continue;
      if (!Number.isFinite(value)) return `${labels[priority]}: ${name} must be a number.`;
      if (value <= 0) return `${labels[priority]}: ${name} must be more than 0 (leave it empty for no target).`;
      if (value > MAX_SLA_HOURS) return `${labels[priority]}: ${name} can be at most ${MAX_SLA_HOURS}.`;
      out[priority][key] = Math.round(value * 100) / 100;
    }
    const { responseHours, resolutionHours } = out[priority];
    if (responseHours !== null && resolutionHours !== null && resolutionHours < responseHours) {
      return `${labels[priority]}: the time to resolution cannot be shorter than the time to first response.`;
    }
  }
  return out;
}

export type SlaState = 'met' | 'within' | 'breached' | 'no_target' | 'not_recorded';

export interface SlaClock {
  state: SlaState;
  targetHours: number | null;
  dueAt: Date | null;
  /** Minutes from creation to the response/resolution, or to now while still running. */
  elapsedMinutes: number | null;
  /** Minutes left before the target while still running. */
  remainingMinutes: number | null;
}

function clock(hours: number | null, created: Date | null, doneAt: Date | null, running: boolean, now: Date): SlaClock {
  if (!created) return { state: 'not_recorded', targetHours: hours, dueAt: null, elapsedMinutes: null, remainingMinutes: null };
  const elapsedMinutes = doneAt ? minutesBetween(created, doneAt) : running ? minutesBetween(created, now) : null;
  if (hours === null) return { state: 'no_target', targetHours: null, dueAt: null, elapsedMinutes, remainingMinutes: null };
  const dueAt = new Date(created.getTime() + hours * 3_600_000);
  if (doneAt) {
    return { state: doneAt.getTime() - created.getTime() > hours * 3_600_000 ? 'breached' : 'met', targetHours: hours, dueAt, elapsedMinutes, remainingMinutes: null };
  }
  if (!running) return { state: 'not_recorded', targetHours: hours, dueAt, elapsedMinutes: null, remainingMinutes: null };
  const late = now.getTime() > dueAt.getTime();
  return {
    state: late ? 'breached' : 'within',
    targetHours: hours,
    dueAt,
    elapsedMinutes,
    remainingMinutes: late ? 0 : Math.round(((dueAt.getTime() - now.getTime()) / 60000) * 100) / 100,
  };
}

/**
 * Whether a case is within or past its targets, at `now`.
 *   response    running while the case is 'open' with no first response;
 *               a case that left 'open' without a recorded response is "not recorded".
 *   resolution  running while the case is in an open status; a finished case
 *               without a resolvedAt is "not recorded".
 */
export function evaluateSla(doc: any, sla: SlaSettings, now: Date): { response: SlaClock; resolution: SlaClock } {
  const target = sla[doc?.priority] || { responseHours: null, resolutionHours: null };
  const created = asDate(doc?.createdAt);
  const responded = asDate(doc?.firstResponseAt);
  const resolved = asDate(doc?.resolvedAt);
  return {
    response: clock(target.responseHours, created, responded, !responded && doc?.status === 'open', now),
    resolution: clock(target.resolutionHours, created, resolved, !resolved && OPEN_CASE_STATUSES.includes(doc?.status), now),
  };
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

export interface Assignee {
  id: string;
  email: string;
  name: string;
  role: string;
  roleLabel: string;
  /** Holds support:manage, so can also act on the case (notes, replies, status). */
  canAct: boolean;
}

/**
 * Admins who may be assigned a case of `team`: active accounts whose role is
 * the team (or Super Admins) and who can at least open support cases
 * (support:view, from their role or an extra permission).
 */
export async function eligibleAssignees(db: Db, team: string): Promise<Assignee[]> {
  if (!isTeam(team)) return [];
  const admins = await db
    .collection('admins')
    .find({ status: { $ne: 'disabled' } }, { projection: { email: 1, name: 1, role: 1, extraPermissions: 1 } })
    .toArray();
  const out: Assignee[] = [];
  for (const admin of admins) {
    const role = normaliseRole(admin.role);
    if (!role || (role !== 'super_admin' && role !== team)) continue;
    const identity = { role: admin.role, perms: Array.isArray(admin.extraPermissions) ? admin.extraPermissions : [] };
    if (!can(identity, 'support:view')) continue;
    out.push({
      id: String(admin._id),
      email: String(admin.email || ''),
      name: String(admin.name || admin.email || ''),
      role,
      roleLabel: ROLES.find((r) => r.value === role)?.label || role,
      canAct: can(identity, 'support:manage'),
    });
  }
  // Team members first, then Super Admins; each by name.
  return out.sort((a, b) => Number(a.role === 'super_admin') - Number(b.role === 'super_admin') || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

export function nextPriority(priority: unknown): string {
  const index = PRIORITY_ORDER.indexOf(String(priority));
  const from = index === -1 ? PRIORITY_ORDER.indexOf('normal') : index;
  return PRIORITY_ORDER[Math.min(from + 1, PRIORITY_ORDER.length - 1)];
}

/** The fields an escalation stores: one step higher priority, the flag and an entry in `escalations`. */
export function escalationFields(
  existing: any,
  input: { reason: string; at: Date; by: string | null; byName: string | null; toTeam?: string | null; toAssignee?: string | null }
): Record<string, any> {
  const fromPriority = PRIORITY_ORDER.includes(existing?.priority) ? existing.priority : 'normal';
  const toPriority = nextPriority(fromPriority);
  const entry = {
    at: input.at,
    by: input.by,
    byName: input.byName,
    reason: input.reason,
    fromPriority,
    toPriority,
    fromTeam: existing?.assignedTeam || null,
    toTeam: input.toTeam === undefined ? existing?.assignedTeam || null : input.toTeam,
    fromAssignee: existing?.assignedTo || null,
    toAssignee: input.toAssignee === undefined ? existing?.assignedTo || null : input.toAssignee,
  };
  return {
    priority: toPriority,
    escalated: true,
    escalationLevel: (Number(existing?.escalationLevel) || 0) + 1,
    escalatedAt: input.at,
    escalatedBy: input.by,
    escalationReason: input.reason,
    escalations: [...(Array.isArray(existing?.escalations) ? existing.escalations : []), entry],
  };
}

/* ------------------------------------------------------------------ */
/* Bookings and refunds linked to a case                               */
/* ------------------------------------------------------------------ */

/**
 * Checks the booking and refund a case names and links them:
 *   - a booking must exist and belong to the case's customer;
 *   - a refund must exist, belong to the same booking and customer; its
 *     booking is filled in when the case has none;
 *   - a case with a booking and no refund is linked to the booking's latest refund;
 *   - a case "about a refund" must end up linked to one.
 * Changes `doc` in place. Returns an error message, or null.
 */
export async function linkCaseRecords(db: Db, doc: Record<string, any>, check: { booking: boolean; refund: boolean } = { booking: true, refund: true }): Promise<string | null> {
  const bookingId = typeof doc.bookingId === 'string' ? doc.bookingId.trim() : '';
  const refundId = typeof doc.refundId === 'string' ? doc.refundId.trim() : '';

  if (bookingId && check.booking) {
    const booking = await findBooking(db, bookingId);
    if (!booking) return 'The related booking ID does not match any booking.';
    if (doc.customerPhone && booking.userPhone && last10(booking.userPhone) !== last10(doc.customerPhone)) {
      return "That booking was made with a different phone number than this customer's.";
    }
  }

  if (refundId && (check.refund || check.booking)) {
    const oid = toObjectId(refundId);
    if (!oid) return 'The related refund ID is not a valid ID.';
    const refund = await db.collection('refunds').findOne({ _id: oid }, { projection: { bookingId: 1, customerPhone: 1 } });
    if (!refund) return 'The related refund ID does not match any refund.';
    if (bookingId && refund.bookingId && String(refund.bookingId) !== bookingId) return 'That refund belongs to a different booking.';
    if (doc.customerPhone && refund.customerPhone && last10(refund.customerPhone) !== last10(doc.customerPhone)) {
      return 'That refund belongs to a different customer.';
    }
    if (!bookingId && refund.bookingId) doc.bookingId = String(refund.bookingId);
  } else if (!refundId && bookingId && (check.booking || check.refund)) {
    const latest = await db.collection('refunds').find({ bookingId }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).limit(1).next();
    if (latest) doc.refundId = String(latest._id);
  }

  if (doc.aboutRefund === true && !(typeof doc.refundId === 'string' && doc.refundId.trim())) {
    return 'A case about a refund must be linked to it: enter the refund ID, or the booking ID of a booking that has a refund.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

export type RatingSubject = 'event' | 'artist' | 'organizer';

/**
 * Which feedback documents are about an event, an artist or an organiser:
 *   event      targetType 'event' and targetId (or eventId) is the event
 *   artist     targetType 'artist' and targetId is the artist, or a rating of
 *              an event the artist performed in or created (`artistIds`)
 *   organizer  targetType 'organizer' and targetId is the organiser, or a
 *              rating of an event the organiser created (`organizerId`)
 * Ratings from the app store eventId, organizerId and artistIds when they are
 * written, so they are aggregated without guessing by name.
 */
export function ratingMatch(subject: RatingSubject, id: string): Record<string, any> {
  const oid = toObjectId(id);
  const values: any[] = oid ? [id, oid] : [id];
  if (subject === 'event') return { targetType: 'event', $or: [{ targetId: { $in: values } }, { eventId: { $in: values } }] };
  if (subject === 'artist') {
    return { $or: [{ targetType: 'artist', targetId: { $in: values } }, { targetType: 'event', artistIds: { $in: values } }] };
  }
  return { $or: [{ targetType: 'organizer', targetId: { $in: values } }, { targetType: 'event', organizerId: { $in: values } }] };
}

/**
 * Ratings recorded before ratings were linked by id name an artist only by
 * `targetName`. Such a rating counts for an artist only when exactly one
 * artist has that name (the rule the artist screens already used).
 */
async function legacyArtistMatch(db: Db, id: string): Promise<Record<string, any> | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const artist = await db.collection('artists').findOne({ _id: oid }, { projection: { name: 1 } });
  const name = typeof artist?.name === 'string' ? artist.name.trim() : '';
  if (!name) return null;
  const pattern = '^\\s*' + escapeRegex(name) + '\\s*$';
  const same = await db.collection('artists').countDocuments({ name: { $regex: pattern, $options: 'i' } });
  if (same !== 1) return null;
  return { targetType: 'artist', targetId: { $in: ['', null] }, targetName: { $regex: pattern, $options: 'i' } };
}

export async function ratingFilter(db: Db, subject: RatingSubject, id: string): Promise<Record<string, any>> {
  const base = ratingMatch(subject, id);
  if (subject !== 'artist') return base;
  const legacy = await legacyArtistMatch(db, id);
  if (!legacy) return base;
  return { $or: [...base.$or, legacy] };
}

function firstName(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.split(/\s+/)[0].slice(0, 40) : '';
}

export interface RatingSummary {
  average: number | null;
  count: number;
  distribution: Record<string, number>;
  pending: number;
  hidden: number;
  recent: { id: string; rating: number; comment: string; name: string; at: Date | null; eventName: string }[];
}

/**
 * Published average and count, how many wait for moderation or are hidden,
 * and the latest published ratings. `publicView` gives first names only and
 * leaves out the moderation counts.
 */
export async function ratingSummary(db: Db, subject: RatingSubject, id: string, options: { publicView?: boolean; limit?: number } = {}): Promise<RatingSummary> {
  const match = await ratingFilter(db, subject, id);
  const valid = { rating: { $gte: 1, $lte: 5 } };
  const [grouped, pending, hidden, recent] = await Promise.all([
    db
      .collection('feedback')
      .aggregate([{ $match: { $and: [match, valid, { status: 'published' }] } }, { $group: { _id: '$rating', count: { $sum: 1 } } }])
      .toArray(),
    options.publicView ? Promise.resolve(0) : db.collection('feedback').countDocuments({ $and: [match, { status: 'pending' }] }),
    options.publicView ? Promise.resolve(0) : db.collection('feedback').countDocuments({ $and: [match, { status: 'hidden' }] }),
    db
      .collection('feedback')
      .find({ $and: [match, valid, { status: 'published' }] }, { projection: { rating: 1, comment: 1, customerName: 1, createdAt: 1, targetName: 1 } })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(options.limit || 10, 1), 50))
      .toArray(),
  ]);
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let sum = 0;
  let count = 0;
  for (const row of grouped) {
    const rating = Number(row._id);
    if (!Number.isFinite(rating)) continue;
    // Whole stars are what the app sends; anything else is counted in the nearest star.
    const star = String(Math.min(5, Math.max(1, Math.round(rating))));
    distribution[star] += row.count;
    sum += rating * row.count;
    count += row.count;
  }
  return {
    average: count ? Math.round((sum / count) * 100) / 100 : null,
    count,
    distribution,
    pending,
    hidden,
    recent: recent.map((r) => ({
      id: String(r._id),
      rating: Number(r.rating),
      comment: typeof r.comment === 'string' ? r.comment.slice(0, 1000) : '',
      name: options.publicView ? firstName(r.customerName) || 'Customer' : String(r.customerName || ''),
      at: r.createdAt || null,
      eventName: typeof r.targetName === 'string' ? r.targetName : '',
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

function caseHooks() {
  return {
    // The first internal note counts as the first response, recorded when it is written.
    afterNote: async ({ db, item, note }: { db: Db; item: any; note: { by: string | null; at: Date }; admin: AdminIdentity }) => {
      const fields = firstResponseFields(item, note.at, note.by, 'note');
      if (Object.keys(fields).length) {
        await db.collection('supportCases').updateOne({ _id: item._id, firstResponseAt: { $in: [null] } }, { $set: fields });
      }
    },
    beforeCreate: async ({ db, doc }: { db: Db; doc: Record<string, any>; admin: AdminIdentity }) => {
      doc.source = 'admin';
      doc.escalated = false;
      doc.escalationLevel = 0;
      return (await linkCaseRecords(db, doc)) || undefined;
    },
    beforeUpdate: async ({ db, existing, changes }: { db: Db; existing: any; changes: Record<string, any> }) => {
      const bookingChanged = 'bookingId' in changes && (changes.bookingId || '') !== (existing.bookingId || '');
      const phoneChanged = 'customerPhone' in changes && last10(changes.customerPhone) !== last10(existing.customerPhone);
      const refundChanged =
        ('refundId' in changes && (changes.refundId || '') !== (existing.refundId || '')) ||
        ('aboutRefund' in changes && Boolean(changes.aboutRefund) !== Boolean(existing.aboutRefund));
      if (!bookingChanged && !refundChanged && !phoneChanged) return;
      const merged: Record<string, any> = { ...existing, ...changes };
      // A changed booking with the old refund still named: link the refund of the new booking instead.
      if (bookingChanged && !('refundId' in changes && changes.refundId)) merged.refundId = '';
      const problem = await linkCaseRecords(db, merged, { booking: bookingChanged || phoneChanged, refund: refundChanged || phoneChanged });
      if (problem) return problem;
      if ((merged.refundId || '') !== (existing.refundId || '')) changes.refundId = merged.refundId || null;
      if ((merged.bookingId || '') !== (existing.bookingId || '')) changes.bookingId = merged.bookingId || null;
    },
    beforeStatusChange: ({ existing, from, to, admin, reason }: { existing: any; from: string; to: string; admin: AdminIdentity; reason: string }) => {
      if (DONE_CASE_STATUSES.includes(from) && OPEN_CASE_STATUSES.includes(to) && reason.length < MIN_REASON) {
        return `Reopening a case needs a reason of at least ${MIN_REASON} characters.`;
      }
      const at = new Date();
      const by = admin.email || null;
      const extra = statusTimingFields(existing, from, to, at, by);
      if (to === 'escalated') Object.assign(extra, escalationFields(existing, { reason, at, by, byName: admin.name || null }));
      return extra;
    },
  };
}

registerHooks(caseResourceName('complaint'), caseHooks());
registerHooks(caseResourceName('ticket'), caseHooks());

registerHooks('feedback', {
  beforeStatusChange: ({ admin, reason }) => ({
    moderatedBy: admin.email || null,
    moderatedAt: new Date(),
    moderationReason: reason || null,
  }),
});
