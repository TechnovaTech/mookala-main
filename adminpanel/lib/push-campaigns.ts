import { ObjectId, type Db } from 'mongodb';
import {
  DEVICE_COLLECTION,
  LOG_COLLECTION,
  getChannelConfig,
  logDelivery,
  messageBlocker,
  resolveAudience,
  sendPushMessage,
  type AudiencePart,
} from './notifications';
import { normalisePhone } from './otp';

/**
 * Push campaign delivery and performance (requirements section 13). Server only.
 *
 * AUDIENCE  all customers, customers in a city, followers of an artist, ticket
 *           holders of an event, all artists, all organisers. Accounts are
 *           resolved by lib/notifications.ts (resolveAudience), which also says
 *           which app each kind of account uses. A campaign reaches the
 *           accounts that have at least one valid device token for that app
 *           (`deviceTokens`, written by POST /api/public/devices).
 *
 * SENDING   every message goes through lib/notifications.ts sendPushMessage():
 *           the push channel's provider (Firebase Cloud Messaging), the
 *           campaign's approver recorded as the content approver, and one
 *           delivery log entry per device in `notificationLogs`, linked by
 *           campaignId. The FCM data payload carries the campaignId so the
 *           app can report the open (POST /api/public/notifications/opened).
 *
 * ONCE PER DEVICE  before a message is handed over, the pair { campaignId,
 *           token } is claimed in `pushCampaignRecipients` (unique index). A
 *           device whose row is accepted, or still claimed, is never sent the
 *           same campaign again. A device whose earlier attempt failed or was
 *           not sent is tried again only on a later, explicit send attempt.
 *
 * SCHEDULE  dispatchDuePushCampaigns() is called every 15 minutes by the
 *           scheduler (/api/cron/notifications) and by "Send now". Each run
 *           sends at most MAX_PUSH_SENDS_PER_RUN messages and keeps a cursor on
 *           the campaign, so a large audience is finished over several runs.
 */

export const RECIPIENTS = 'pushCampaignRecipients';
export const OPENS = 'pushCampaignOpens';

/** Most messages handed to the provider in one run, across all campaigns. */
export const MAX_PUSH_SENDS_PER_RUN = 1000;
/** Accounts read per step, and messages sent in parallel. */
const ACCOUNT_BATCH = 200;
const PARALLEL_SENDS = 20;
/** How long one run may hold a campaign before another run may resume it. */
const LEASE_MS = 5 * 60 * 1000;

export const PUSH_AUDIENCES = ['all_users', 'city', 'followers_of_artist', 'event_attendees', 'artists', 'organisers'] as const;

/** Statuses in which the scheduler (or "Send now") may send a campaign. */
export const SENDABLE_STATUSES = ['approved', 'scheduled', 'failed'];

/** Tokens a campaign may use: valid, for the app the accounts use. */
function tokenFilter(part: AudiencePart, phones: string[]) {
  return {
    phone: { $in: phones },
    app: part.app,
    $or: [{ status: 'valid' }, { status: { $exists: false }, invalidAt: null }],
  };
}

/**
 * Turns a campaign's audience into account queries (see the file header).
 * "Ticket holders of an event" are customers with a confirmed or attended
 * booking for it.
 */
export async function resolvePushAudience(db: Db, audience: string, value?: string | null): Promise<AudiencePart[] | string> {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!(PUSH_AUDIENCES as readonly string[]).includes(audience)) return 'Unknown audience';
  if (audience === 'event_attendees') {
    if (!input) return 'Enter the event ID in "Audience value"';
    return resolveAudience(db, 'customers', null, { event: input });
  }
  return resolveAudience(db, audience, input);
}

async function phonesOf(db: Db, part: AudiencePart): Promise<string[]> {
  const raw = await db.collection(part.collection).distinct('phone', part.filter);
  const clean = new Set<string>();
  for (const p of raw) {
    const n = normalisePhone(String(p || ''));
    if (n) clean.add(n);
  }
  return Array.from(clean);
}

export interface AudiencePreview {
  /** Accounts that match the audience. */
  accounts: number;
  /** Of those, accounts with at least one valid device for their app. */
  reachableAccounts: number;
  /** Devices that would receive the push. */
  devices: number;
  breakdown: { label: string; app: string; accounts: number; reachableAccounts: number; devices: number }[];
}

/** Exact counts for the audience as it stands now. */
export async function previewPushAudience(db: Db, parts: AudiencePart[]): Promise<AudiencePreview> {
  const breakdown: AudiencePreview['breakdown'] = [];
  const allTokens = new Set<string>();
  const allReachable = new Set<string>();
  let accounts = 0;
  for (const part of parts) {
    const count = await db.collection(part.collection).countDocuments(part.filter);
    const phones = await phonesOf(db, part);
    const tokens = phones.length
      ? await db.collection(DEVICE_COLLECTION).find(tokenFilter(part, phones), { projection: { token: 1, phone: 1 } }).toArray()
      : [];
    const reachable = new Set(tokens.map((t) => String(t.phone)));
    const partTokens = new Set(tokens.map((t) => String(t.token)));
    partTokens.forEach((t) => allTokens.add(t));
    reachable.forEach((p) => allReachable.add(`${part.collection}:${p}`));
    accounts += count;
    breakdown.push({ label: part.label, app: part.app, accounts: count, reachableAccounts: reachable.size, devices: partTokens.size });
  }
  return { accounts, reachableAccounts: allReachable.size, devices: allTokens.size, breakdown };
}

let indexesReady = false;
async function ensureIndexes(db: Db) {
  if (indexesReady) return;
  await db.collection(RECIPIENTS).createIndex({ campaignId: 1, token: 1 }, { unique: true });
  await db.collection(RECIPIENTS).createIndex({ campaignId: 1, status: 1 });
  await db.collection(RECIPIENTS).createIndex({ campaignId: 1, phone: 1 });
  await db.collection(OPENS).createIndex({ campaignId: 1, phone: 1 }, { unique: true });
  indexesReady = true;
}

interface Cursor {
  part: number;
  lastId: string | null;
}

export interface DispatchOptions {
  /** Only this campaign (used by "Send now"). */
  campaignId?: string;
  /** Overrides MAX_PUSH_SENDS_PER_RUN, mainly for tests. */
  maxSends?: number;
  /** Who started the run: an admin's email for "Send now", otherwise the scheduler. */
  requestedBy?: string | null;
}

export interface DispatchResult {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Campaigns whose time has come: approved or scheduled with "Scheduled for"
 * reached, or already sending. With `campaignId` ("Send now") an approved or
 * failed campaign is due at once; a scheduled one only once its time is reached.
 */
function dueFilter(now: Date, campaignId?: string) {
  const approved = { approvedBy: { $nin: [null, ''] } };
  if (campaignId) {
    return {
      _id: new ObjectId(campaignId),
      ...approved,
      $or: [
        { status: { $in: ['approved', 'failed', 'sending'] } },
        { status: 'scheduled', scheduledFor: { $ne: null, $lte: now } },
      ],
    };
  }
  return {
    ...approved,
    $or: [{ status: { $in: ['approved', 'scheduled'] }, scheduledFor: { $ne: null, $lte: now } }, { status: 'sending' }],
  };
}

export interface CampaignTotals {
  targeted: number;
  attempted: number;
  accepted: number;
  delivered: number;
  failed: number;
  notSent: number;
  opened: number;
}

/** How far a log entry got, so each device is counted once by its best entry (a retry may succeed after a failure). */
const OUTCOME_RANK: Record<string, number> = { read: 5, delivered: 4, accepted: 3, queued: 2, failed: 1, not_sent: 0 };

/**
 * Figures for one campaign, one per device: from the delivery log entries
 * (which the provider pipeline and its automatic retries keep up to date),
 * the recipient rows written when sending, and the opens the apps report.
 */
export async function campaignTotals(db: Db, campaignId: string): Promise<CampaignTotals> {
  const [rows, perDevice, opened] = await Promise.all([
    db.collection(RECIPIENTS).aggregate([{ $match: { campaignId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    db
      .collection(LOG_COLLECTION)
      .aggregate([
        { $match: { campaignId, channel: 'push', kind: { $ne: 'campaign' } } },
        {
          $group: {
            _id: '$to',
            best: {
              $max: {
                $switch: {
                  branches: Object.entries(OUTCOME_RANK).map(([status, rank]) => ({ case: { $eq: ['$status', status] }, then: rank })),
                  default: 0,
                },
              },
            },
          },
        },
        { $group: { _id: '$best', n: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection(OPENS).countDocuments({ campaignId }),
  ]);
  const r: Record<string, number> = Object.fromEntries(rows.map((x) => [String(x._id), x.n]));
  const byRank = (rank: number) => perDevice.filter((x) => x._id === rank).reduce((a, x) => a + x.n, 0);
  const atLeast = (rank: number) => perDevice.filter((x) => x._id >= rank).reduce((a, x) => a + x.n, 0);
  const targeted = Object.values(r).reduce((a, b) => a + b, 0);
  return {
    targeted,
    attempted: targeted - (r.claimed || 0),
    // A message later reported delivered or read was accepted first.
    accepted: atLeast(OUTCOME_RANK.accepted),
    delivered: atLeast(OUTCOME_RANK.delivered),
    failed: byRank(OUTCOME_RANK.failed),
    notSent: byRank(OUTCOME_RANK.not_sent),
    opened,
  };
}

async function finishCampaign(db: Db, campaign: any, attempt: number, reasonIfNone: string | null) {
  const id = String(campaign._id);
  const totals = await campaignTotals(db, id);
  const now = new Date();
  const status = totals.accepted > 0 ? 'sent' : 'failed';
  const notDelivered = totals.failed + totals.notSent;
  const failureReason =
    totals.accepted > 0
      ? notDelivered > 0
        ? `${totals.accepted} accepted by the provider, ${notDelivered} not accepted (see the delivery log)`
        : null
      : `Not sent: ${reasonIfNone || 'the provider accepted none of the messages (see the delivery log)'}`;
  await db.collection('pushCampaigns').updateOne(
    { _id: campaign._id, status: 'sending', dispatchAttempt: attempt },
    {
      $set: {
        status,
        statusReason: failureReason,
        statusChangedAt: now,
        statusChangedBy: 'scheduler',
        failureReason,
        sentCount: totals.attempted,
        acceptedCount: totals.accepted,
        failedCount: notDelivered,
        completedAt: now,
        dispatchLockedUntil: null,
        updatedAt: now,
      },
    }
  );
}

async function failWithoutSending(db: Db, campaign: any, attempt: number, reason: string, provider: string | null) {
  await logDelivery(db, {
    channel: 'push',
    to: 'campaign',
    subject: campaign.title,
    body: campaign.message,
    status: 'not_sent',
    error: reason,
    campaignId: String(campaign._id),
    campaignType: 'push-campaign',
    kind: 'campaign',
    bulk: true,
    provider,
    attempt,
    requestedBy: 'scheduler',
  });
  await finishCampaign(db, campaign, attempt, reason);
}

/** Starts a send attempt on a due campaign, or picks up the one in progress, holding a short lease. */
async function lease(db: Db, campaign: any, requestedBy: string | null): Promise<any | null> {
  const nowReal = new Date();
  const until = new Date(nowReal.getTime() + LEASE_MS);
  const free = { $or: [{ dispatchLockedUntil: null }, { dispatchLockedUntil: { $exists: false } }, { dispatchLockedUntil: { $lte: nowReal } }] };
  if (campaign.status === 'sending') {
    return db
      .collection('pushCampaigns')
      .findOneAndUpdate({ _id: campaign._id, status: 'sending', ...free }, { $set: { dispatchLockedUntil: until } }, { returnDocument: 'after' });
  }
  const attempt = (campaign.attempts || 0) + 1;
  return db.collection('pushCampaigns').findOneAndUpdate(
    { _id: campaign._id, status: campaign.status, ...free },
    {
      $set: {
        status: 'sending',
        statusChangedAt: nowReal,
        statusChangedBy: requestedBy || 'scheduler',
        statusReason: null,
        dispatchAttempt: attempt,
        dispatchCursor: { part: 0, lastId: null },
        dispatchStartedAt: nowReal,
        dispatchStartedBy: requestedBy || 'scheduler',
        dispatchLockedUntil: until,
        lastAttemptAt: nowReal,
        failureReason: null,
        updatedAt: nowReal,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' }
  );
}

/** Claims one device for one attempt. False when it was already sent (or is being sent) this campaign. */
async function claim(db: Db, campaignId: string, attempt: number, token: any, account: { phone: string; part: AudiencePart; accountId: string }) {
  try {
    const res = await db.collection(RECIPIENTS).findOneAndUpdate(
      { campaignId, token: String(token.token), status: { $in: ['failed', 'not_sent'] }, attempt: { $lt: attempt } },
      {
        $set: {
          status: 'claimed',
          attempt,
          phone: account.phone,
          accountType: account.part.collection,
          accountId: account.accountId,
          app: account.part.app,
          platform: token.platform || null,
          claimedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' }
    );
    return Boolean(res);
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

const RECIPIENT_TYPE: Record<string, string> = { users: 'user', artists: 'artist', organizers: 'organizer' };

/**
 * Sends approved push campaigns whose scheduled time has arrived, in capped
 * batches, resuming where the previous run stopped. Never sends one campaign
 * twice to the same device. Returns what this run did.
 */
export async function dispatchDuePushCampaigns(db: Db, now: Date, options: DispatchOptions = {}): Promise<DispatchResult> {
  const result: DispatchResult = { attempted: 0, sent: 0, failed: 0 };
  if (options.campaignId && !(ObjectId.isValid(options.campaignId) && options.campaignId.length === 24)) return result;
  await ensureIndexes(db);

  const cap = Math.max(0, Math.min(options.maxSends ?? MAX_PUSH_SENDS_PER_RUN, MAX_PUSH_SENDS_PER_RUN * 10));
  const due = await db
    .collection('pushCampaigns')
    .find(dueFilter(now, options.campaignId))
    .sort({ scheduledFor: 1, _id: 1 })
    .limit(50)
    .toArray();

  for (const candidate of due) {
    if (result.attempted >= cap) break;
    const campaign = await lease(db, candidate, options.requestedBy || null);
    if (!campaign) continue;
    const id = String(campaign._id);
    const attempt: number = campaign.dispatchAttempt || 1;

    const config = await getChannelConfig(db, 'push');
    const blocker = messageBlocker(config);
    if (blocker) {
      await failWithoutSending(db, campaign, attempt, blocker, config.provider || null);
      continue;
    }

    const parts = await resolvePushAudience(db, campaign.audience, campaign.audienceValue);
    if (typeof parts === 'string') {
      await failWithoutSending(db, campaign, attempt, parts, config.provider || null);
      continue;
    }
    if (campaign.dispatchCountedAttempt !== attempt) {
      // First run of this attempt: record the audience as it stands when sending starts.
      const preview = await previewPushAudience(db, parts);
      await db.collection('pushCampaigns').updateOne(
        { _id: campaign._id },
        {
          $set: {
            audienceCount: preview.accounts,
            reachableAccounts: preview.reachableAccounts,
            reachableDevices: preview.devices,
            dispatchCountedAttempt: attempt,
          },
        }
      );
      if (preview.devices === 0) {
        await failWithoutSending(
          db,
          campaign,
          attempt,
          `none of the ${preview.accounts} matching account${preview.accounts === 1 ? '' : 's'} has a registered device`,
          config.provider || null
        );
        continue;
      }
    }

    const cursor: Cursor = { part: campaign.dispatchCursor?.part || 0, lastId: campaign.dispatchCursor?.lastId || null };
    let stoppedEarly = false;

    while (cursor.part < parts.length) {
      if (result.attempted >= cap) {
        stoppedEarly = true;
        break;
      }
      const part = parts[cursor.part];
      const filter: Record<string, any> = cursor.lastId ? { $and: [part.filter, { _id: { $gt: new ObjectId(cursor.lastId) } }] } : part.filter;
      const accounts = await db
        .collection(part.collection)
        .find(filter, { projection: { phone: 1, name: 1 } })
        .sort({ _id: 1 })
        .limit(ACCOUNT_BATCH)
        .toArray();
      if (!accounts.length) {
        cursor.part += 1;
        cursor.lastId = null;
        await db.collection('pushCampaigns').updateOne({ _id: campaign._id }, { $set: { dispatchCursor: cursor } });
        continue;
      }

      const byPhone = new Map<string, any>();
      for (const a of accounts) {
        const p = normalisePhone(String(a.phone || ''));
        if (p && !byPhone.has(p)) byPhone.set(p, a);
      }
      const tokens = byPhone.size
        ? await db
            .collection(DEVICE_COLLECTION)
            .find(tokenFilter(part, Array.from(byPhone.keys())), { projection: { phone: 1, token: 1, platform: 1, app: 1 } })
            .sort({ _id: 1 })
            .toArray()
        : [];

      const queue: { token: any; phone: string; account: any }[] = [];
      const seen = new Set<string>();
      // False when the cap stopped us before every device of this batch was looked at.
      let wholeBatch = true;
      for (const t of tokens) {
        const key = String(t.token);
        if (seen.has(key)) continue;
        if (result.attempted + queue.length >= cap) {
          wholeBatch = false;
          break;
        }
        seen.add(key);
        const account = byPhone.get(String(t.phone));
        if (!(await claim(db, id, attempt, t, { phone: String(t.phone), part, accountId: String(account?._id || '') }))) continue;
        queue.push({ token: t, phone: String(t.phone), account });
      }

      for (let i = 0; i < queue.length; i += PARALLEL_SENDS) {
        const slice = queue.slice(i, i + PARALLEL_SENDS);
        const outcomes = await Promise.all(
          slice.map(async (item) => {
            const sent = await sendPushMessage(db, {
              to: String(item.token.token),
              title: String(campaign.title || ''),
              body: String(campaign.message || ''),
              data: {
                type: 'campaign',
                campaignId: id,
                ...(campaign.deepLink ? { deepLink: String(campaign.deepLink) } : {}),
              },
              campaignId: id,
              campaignType: 'push-campaign',
              approvedBy: String(campaign.approvedBy || ''),
              requestedBy: options.requestedBy || campaign.dispatchStartedBy || 'scheduler',
              recipient: {
                type: RECIPIENT_TYPE[part.collection] || part.collection,
                id: String(item.account?._id || '') || null,
                name: typeof item.account?.name === 'string' ? item.account.name.slice(0, 120) : null,
              },
              attempt,
            });
            await db.collection(RECIPIENTS).updateOne(
              { campaignId: id, token: String(item.token.token) },
              { $set: { status: sent.status, logId: sent.logId, providerMessageId: sent.providerMessageId, error: sent.error, sentAt: new Date() } }
            );
            return sent.status;
          })
        );
        for (const status of outcomes) {
          result.attempted += 1;
          if (status === 'accepted') result.sent += 1;
          else result.failed += 1;
        }
      }

      // Move past this batch only when every device in it was looked at;
      // otherwise the next run reads it again and the claims skip the done ones.
      if (wholeBatch) {
        cursor.lastId = String(accounts[accounts.length - 1]._id);
        await db.collection('pushCampaigns').updateOne({ _id: campaign._id }, { $set: { dispatchCursor: cursor } });
      } else {
        stoppedEarly = true;
        break;
      }
    }

    if (stoppedEarly) {
      const totals = await campaignTotals(db, id);
      await db.collection('pushCampaigns').updateOne(
        { _id: campaign._id },
        { $set: { dispatchLockedUntil: null, sentCount: totals.attempted, acceptedCount: totals.accepted, updatedAt: new Date() } }
      );
      break;
    }
    await finishCampaign(db, campaign, attempt, null);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Opens                                                               */
/* ------------------------------------------------------------------ */

export type OpenResult = { ok: true; alreadyRecorded: boolean } | { ok: false; error: string; status: number };

/**
 * Records that a customer opened a campaign notification. Counted once per
 * phone and campaign, and only for a phone the campaign was really sent to.
 */
export async function recordCampaignOpen(db: Db, phone: string, campaignId: string): Promise<OpenResult> {
  if (!ObjectId.isValid(campaignId) || campaignId.length !== 24) return { ok: false, error: 'A valid campaignId is required', status: 400 };
  await ensureIndexes(db);
  const rows = await db.collection(RECIPIENTS).find({ campaignId, phone }, { projection: { token: 1, status: 1, app: 1 } }).toArray();
  // Accepted when it was sent, or by an automatic retry of the delivery pipeline afterwards.
  const received =
    rows.find((r) => r.status === 'accepted') ||
    (rows.length &&
    (await db
      .collection(LOG_COLLECTION)
      .findOne({ campaignId, channel: 'push', to: { $in: rows.map((r) => String(r.token)) }, status: { $in: ['accepted', 'delivered', 'read'] } }, { projection: { _id: 1 } }))
      ? rows[0]
      : null);
  if (!received) return { ok: false, error: 'This campaign was not sent to this phone', status: 404 };
  try {
    await db.collection(OPENS).insertOne({ campaignId, phone, app: received.app || null, openedAt: new Date() });
    await db.collection(RECIPIENTS).updateMany({ campaignId, phone, openedAt: { $exists: false } }, { $set: { openedAt: new Date() } });
    return { ok: true, alreadyRecorded: false };
  } catch (error: any) {
    if (error?.code === 11000) return { ok: true, alreadyRecorded: true };
    throw error;
  }
}
