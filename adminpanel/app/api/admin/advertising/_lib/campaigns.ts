import type { Db, ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';
import { logAudit } from '@/lib/audit';
import { toObjectId } from '@/lib/http';
import type { AdminIdentity } from '@/lib/permissions';

/**
 * Rules shared by everything that reads or serves advertiser campaigns.
 * This folder starts with an underscore, so Next.js does not route to it.
 *
 * There is no scheduler. A campaign's status follows its dates whenever
 * campaigns are read (by the apps, by the admin screens or by the tracking
 * endpoint): an approved campaign whose start date has arrived becomes live,
 * and one whose end date has passed becomes completed. Each such change is
 * written to the activity log as an automatic change.
 *
 * Dates are whole days in UTC, the same as banners and sponsored ads. The end
 * date is inclusive: a campaign that ends on the 10th runs for all of the 10th.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Which public list shows a placement. Placements not listed here have no screen in the apps yet. */
export const PLACEMENT_FEED: Record<string, 'ads' | 'banners'> = {
  sponsored_card: 'ads',
  home_banner: 'banners',
};

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The UTC day a moment falls on, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function hasEnded(campaign: any, now = new Date()): boolean {
  const end = toDate(campaign?.endDate);
  return Boolean(end && end.getTime() + DAY_MS <= now.getTime());
}

export function hasStarted(campaign: any, now = new Date()): boolean {
  const start = toDate(campaign?.startDate);
  return !start || start.getTime() <= now.getTime();
}

/** The status a campaign should have right now, given its stored status and its dates. */
export function effectiveStatus(campaign: any, now = new Date()): string {
  const stored = String(campaign?.status || 'draft');
  if (stored !== 'scheduled' && stored !== 'live' && stored !== 'paused') return stored;
  if (hasEnded(campaign, now)) return 'completed';
  if (stored === 'paused') return 'paused';
  return hasStarted(campaign, now) ? 'live' : 'scheduled';
}

export function hasCreative(campaign: any): boolean {
  return Boolean(campaign?.hasCreative) || /^https?:\/\//i.test(String(campaign?.creativeUrl || ''));
}

export interface StatusSyncChange {
  id: string;
  type: 'campaign' | 'invoice';
  label: string;
  from: string;
  to: string;
}

interface SyncContext {
  admin?: AdminIdentity | null;
  request?: NextRequest;
  /** What caused the check, kept in the activity log. */
  trigger: string;
}

/**
 * Brings stored campaign statuses in line with their dates. Safe to call on
 * every read: it only writes when a status is actually out of date, and the
 * update is conditional, so two readers cannot both log the same change.
 */
export async function syncCampaignStatuses(db: Db, context: SyncContext): Promise<StatusSyncChange[]> {
  const now = new Date();
  const candidates = await db
    .collection('adCampaigns')
    .find({ status: { $in: ['scheduled', 'live', 'paused'] } })
    .project({ name: 1, status: 1, startDate: 1, endDate: 1 })
    .toArray();

  const changes: StatusSyncChange[] = [];
  for (const campaign of candidates) {
    const next = effectiveStatus(campaign, now);
    if (next === campaign.status) continue;

    const reason =
      next === 'completed'
        ? 'Automatic: the end date has passed.'
        : next === 'live'
        ? 'Automatic: the start date has arrived.'
        : 'Automatic: the start date is still ahead.';

    const result = await db.collection('adCampaigns').updateOne(
      { _id: campaign._id, status: campaign.status },
      {
        $set: {
          status: next,
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: context.admin?.email || 'system',
          updatedAt: now,
        },
      }
    );
    if (result.modifiedCount !== 1) continue;

    changes.push({ id: String(campaign._id), type: 'campaign', label: campaign.name || '', from: campaign.status, to: next });
    await logAudit({
      admin: context.admin || null,
      action: 'status_change',
      module: 'ads',
      entityType: 'ad-campaigns',
      entityId: String(campaign._id),
      entityLabel: campaign.name || '',
      before: { status: campaign.status },
      after: { status: next },
      reason,
      meta: { automatic: true, trigger: context.trigger },
      request: context.request,
    });
  }
  return changes;
}

/** An unpaid invoice whose due date has passed is overdue. The due date itself is still on time. */
export function invoiceIsOverdue(invoice: any, now = new Date()): boolean {
  if (invoice?.status !== 'invoiced') return false;
  const due = toDate(invoice?.dueDate);
  return Boolean(due && due.getTime() + DAY_MS <= now.getTime());
}

/** Marks unpaid invoices past their due date as overdue, with an activity log entry for each. */
export async function syncInvoiceStatuses(db: Db, context: SyncContext): Promise<StatusSyncChange[]> {
  const now = new Date();
  const candidates = await db
    .collection('adPayments')
    .find({ status: 'invoiced', dueDate: { $lte: new Date(now.getTime() - DAY_MS) } })
    .project({ invoiceNumber: 1, status: 1, dueDate: 1 })
    .toArray();

  const changes: StatusSyncChange[] = [];
  for (const invoice of candidates) {
    if (!invoiceIsOverdue(invoice, now)) continue;
    const reason = 'Automatic: the due date has passed without payment.';
    const result = await db.collection('adPayments').updateOne(
      { _id: invoice._id, status: 'invoiced' },
      { $set: { status: 'overdue', statusReason: reason, statusChangedAt: now, statusChangedBy: context.admin?.email || 'system', updatedAt: now } }
    );
    if (result.modifiedCount !== 1) continue;

    changes.push({ id: String(invoice._id), type: 'invoice', label: invoice.invoiceNumber || '', from: 'invoiced', to: 'overdue' });
    await logAudit({
      admin: context.admin || null,
      action: 'status_change',
      module: 'ads',
      entityType: 'ad-payments',
      entityId: String(invoice._id),
      entityLabel: invoice.invoiceNumber || '',
      before: { status: 'invoiced' },
      after: { status: 'overdue' },
      reason,
      meta: { automatic: true, trigger: context.trigger },
      request: context.request,
    });
  }
  return changes;
}

/** True when a campaign with these target locations should be shown to someone in `city`. */
export function matchesCity(targetLocations: unknown, city: string): boolean {
  const targets = (Array.isArray(targetLocations) ? targetLocations : [])
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
  if (targets.length === 0) return true;
  const wanted = city.trim().toLowerCase();
  return Boolean(wanted) && targets.includes(wanted);
}

export interface ServedCampaign {
  campaign: any;
  image: string;
  mediaType: 'image' | 'video';
  sponsor: string;
}

/**
 * The advertiser campaigns the apps should show in one feed right now:
 * live, inside their dates, with a creative, for a verified advertiser, and
 * (when the campaign targets cities) only for a matching city.
 */
export async function servedCampaigns(db: Db, feed: 'ads' | 'banners', city: string): Promise<ServedCampaign[]> {
  await syncCampaignStatuses(db, { trigger: `public /api/${feed}` });

  const placements = Object.keys(PLACEMENT_FEED).filter((key) => PLACEMENT_FEED[key] === feed);
  const now = new Date();
  const live = (
    await db
      .collection('adCampaigns')
      .find({ status: 'live', placement: { $in: placements } })
      .sort({ startDate: 1, createdAt: 1 })
      .toArray()
  ).filter((campaign) => effectiveStatus(campaign, now) === 'live' && hasCreative(campaign) && matchesCity(campaign.targetLocations, city));
  if (live.length === 0) return [];

  const advertiserIds = Array.from(new Set(live.map((c) => String(c.advertiser))))
    .map((id) => toObjectId(id))
    .filter(Boolean) as ObjectId[];
  const [advertisers, creatives] = await Promise.all([
    db
      .collection('advertisers')
      .find({ _id: { $in: advertiserIds }, status: 'verified' })
      .project({ businessName: 1 })
      .toArray(),
    db
      .collection('adCreatives')
      .find({ campaignId: { $in: live.map((c) => String(c._id)) } })
      .toArray(),
  ]);
  const advertiserName = new Map(advertisers.map((a) => [String(a._id), String(a.businessName || '')]));
  const creativeOf = new Map(creatives.map((c) => [String(c.campaignId), c]));

  const out: ServedCampaign[] = [];
  for (const campaign of live) {
    // A campaign of an advertiser who is no longer verified is not shown.
    if (!advertiserName.has(String(campaign.advertiser))) continue;
    const creative = creativeOf.get(String(campaign._id));
    const image = creative?.image || campaign.creativeUrl || '';
    if (!image) continue;
    out.push({
      campaign,
      image,
      mediaType: creative?.mediaType === 'video' || String(image).startsWith('data:video/') ? 'video' : 'image',
      sponsor: advertiserName.get(String(campaign.advertiser)) || '',
    });
  }
  return out;
}

/** The next free advertiser invoice number, e.g. ADV-2026-0007. Numbers are issued once and never reused. */
export async function nextInvoiceNumber(db: Db): Promise<string> {
  const year = new Date().getUTCFullYear();
  for (let attempt = 0; attempt < 50; attempt++) {
    const counter = await db
      .collection<{ _id: string; seq: number }>('adCounters')
      .findOneAndUpdate({ _id: `invoice-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    const number = `ADV-${year}-${String(counter?.seq || 1).padStart(4, '0')}`;
    // Older invoices were numbered by hand, so a clash is possible once.
    if (!(await db.collection('adPayments').findOne({ invoiceNumber: number }, { projection: { _id: 1 } }))) return number;
  }
  throw new Error('Could not issue an invoice number');
}

export const DEFAULT_GST_PERCENT = 18;
export const INVOICE_DUE_DAYS = 15;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Today at 00:00 UTC, the form every date-only field is stored in. */
export function startOfToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
