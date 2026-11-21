/** Server-side rules for the advertiser, campaign and billing resources. */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { toObjectId } from '../http';
import { logAudit } from '../audit';
import {
  DAY_MS,
  INVOICE_DUE_DAYS,
  hasCreative,
  hasEnded,
  hasStarted,
  nextInvoiceNumber,
  round2,
  toDate,
} from '../../app/api/admin/advertising/_lib/campaigns';

async function findById(db: Db, collection: string, id: unknown) {
  const oid = toObjectId(id);
  return oid ? db.collection(collection).findOne({ _id: oid }) : null;
}

function day(value: unknown): string {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

/* --------------------------- advertisers -------------------------- */

registerHooks('advertisers', {
  /** An advertiser who is suspended or rejected cannot keep campaigns running. */
  async afterStatusChange({ db, item, to, admin }) {
    if (to !== 'suspended' && to !== 'rejected') return;
    const running = await db
      .collection('adCampaigns')
      .find({ advertiser: String(item._id), status: { $in: ['scheduled', 'live'] } })
      .project({ name: 1, status: 1 })
      .toArray();
    const reason = `Advertiser ${item.businessName} was ${to}${item.statusReason ? `: ${item.statusReason}` : ''}`.slice(0, 500);
    for (const campaign of running) {
      await db.collection('adCampaigns').updateOne(
        { _id: campaign._id },
        { $set: { status: 'paused', statusReason: reason, statusChangedAt: new Date(), statusChangedBy: admin.email || null, updatedAt: new Date() } }
      );
      await logAudit({
        admin,
        action: 'status_change',
        module: 'ads',
        entityType: 'ad-campaigns',
        entityId: String(campaign._id),
        entityLabel: campaign.name || '',
        before: { status: campaign.status },
        after: { status: 'paused' },
        reason,
        meta: { cascade: 'advertiser status' },
      });
    }
  },

  async beforeDelete({ db, existing }) {
    const id = String(existing._id);
    const [campaigns, invoices, applications] = await Promise.all([
      db.collection('adCampaigns').countDocuments({ advertiser: id }),
      db.collection('adPayments').countDocuments({ advertiser: id }),
      db.collection('adApplications').countDocuments({ advertiser: id }),
    ]);
    if (campaigns || invoices || applications) {
      return `This advertiser has ${applications} application(s), ${campaigns} campaign(s) and ${invoices} invoice(s), so the account cannot be deleted. Suspend it instead.`;
    }
  },
});

/* -------------------------- applications -------------------------- */

async function applicationLabel(db: Db, advertiserId: unknown, packageId: unknown): Promise<string | { label: string }> {
  const advertiser = await findById(db, 'advertisers', advertiserId);
  if (!advertiser) return 'The selected advertiser does not exist.';
  const pack = await findById(db, 'adPackages', packageId);
  if (!pack) return 'The selected package does not exist.';
  return { label: `${advertiser.businessName} · ${pack.name}` };
}

registerHooks('ad-applications', {
  async beforeCreate({ db, doc }) {
    const result = await applicationLabel(db, doc.advertiser, doc.package);
    if (typeof result === 'string') return result;
    doc.applicationLabel = result.label;
    doc.campaign = null;
  },

  async beforeUpdate({ db, existing, changes }) {
    if (existing.campaign && ['advertiser', 'package', 'requestedStartDate'].some((key) => key in changes && String(changes[key]) !== String(existing[key]))) {
      const campaign = await findById(db, 'adCampaigns', existing.campaign);
      if (campaign) {
        return 'This application has already been approved and its campaign exists. Change the advertiser, package or dates on the campaign instead.';
      }
    }
    if (!('advertiser' in changes) && !('package' in changes)) return;
    const result = await applicationLabel(db, changes.advertiser ?? existing.advertiser, changes.package ?? existing.package);
    if (typeof result === 'string') return result;
    changes.applicationLabel = result.label;
  },

  /** Approving an application creates its campaign, prefilled from the application. */
  async beforeStatusChange({ db, existing, to, admin }) {
    if (to !== 'approved') return;

    const advertiser = await findById(db, 'advertisers', existing.advertiser);
    if (!advertiser) return 'This application has no advertiser on record.';
    if (advertiser.status !== 'verified') {
      return `This application cannot be approved because its advertiser (${advertiser.businessName}) is not verified. Verify the advertiser first.`;
    }
    const pack = await findById(db, 'adPackages', existing.package);
    if (!pack) return 'The package on this application no longer exists. Choose another package first.';

    // Approving again (after a rejection, say) keeps the campaign that already exists.
    if (existing.campaign && (await findById(db, 'adCampaigns', existing.campaign))) return;

    const start = toDate(existing.requestedStartDate);
    if (!start) return 'This application has no requested start date.';
    const days = Math.max(1, Math.floor(Number(pack.durationDays) || 1));
    // The end date is inclusive: a 7-day package from the 1st runs to the 7th.
    const end = new Date(start.getTime() + (days - 1) * DAY_MS);

    const now = new Date();
    const campaign = {
      name: `${advertiser.businessName} · ${pack.name} · ${day(start)}`,
      advertiser: String(advertiser._id),
      package: String(pack._id),
      placement: pack.placement,
      startDate: start,
      endDate: end,
      targetLocations: Array.isArray(existing.targetLocations) ? existing.targetLocations : [],
      targetCategories: [],
      creativeUrl: existing.creativeUrl || null,
      clickUrl: existing.clickUrl || null,
      budget: Number(pack.price) || null,
      hasCreative: false,
      impressions: 0,
      clicks: 0,
      application: String(existing._id),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: admin.email || null,
      updatedBy: admin.email || null,
    };
    const result = await db.collection('adCampaigns').insertOne(campaign);

    await logAudit({
      admin,
      action: 'create',
      module: 'ads',
      entityType: 'ad-campaigns',
      entityId: String(result.insertedId),
      entityLabel: campaign.name,
      after: campaign,
      reason: `Created by approving application "${existing.applicationLabel || existing._id}"`,
      meta: { applicationId: String(existing._id) },
    });

    return { campaign: String(result.insertedId) };
  },

  async beforeDelete({ db, existing }) {
    if (existing.campaign && (await findById(db, 'adCampaigns', existing.campaign))) {
      return 'This application has a campaign. Delete the campaign first, or keep the application as its record.';
    }
  },
});

/* ---------------------------- campaigns --------------------------- */

function datesProblem(start: unknown, end: unknown): string | null {
  if (!start || !end) return null;
  return new Date(end as any).getTime() >= new Date(start as any).getTime() ? null : 'The end date cannot be before the start date.';
}

registerHooks('ad-campaigns', {
  async beforeCreate({ db, doc }) {
    const problem = datesProblem(doc.startDate, doc.endDate);
    if (problem) return problem;
    if (!(await findById(db, 'advertisers', doc.advertiser))) return 'The selected advertiser does not exist.';
    if (doc.package && !(await findById(db, 'adPackages', doc.package))) return 'The selected package does not exist.';
    // Counters only move through /api/public/ads/track.
    doc.impressions = 0;
    doc.clicks = 0;
    doc.hasCreative = false;
    doc.application = null;
  },

  async beforeUpdate({ db, existing, changes }) {
    const problem = datesProblem(changes.startDate ?? existing.startDate, changes.endDate ?? existing.endDate);
    if (problem) return problem;
    if (changes.package && !(await findById(db, 'adPackages', changes.package))) return 'The selected package does not exist.';

    if ('advertiser' in changes && changes.advertiser !== existing.advertiser) {
      const advertiser = await findById(db, 'advertisers', changes.advertiser);
      if (!advertiser) return 'The selected advertiser does not exist.';
      if (['live', 'scheduled'].includes(existing.status) && advertiser.status !== 'verified') {
        return 'This campaign is approved, so its advertiser must be verified.';
      }
      if (await db.collection('adPayments').findOne({ campaign: String(existing._id) }, { projection: { _id: 1 } })) {
        return 'This campaign has invoices, so its advertiser cannot be changed.';
      }
    }

    const approved = ['live', 'scheduled'].includes(existing.status);
    if (approved && 'creativeUrl' in changes && !changes.creativeUrl && !existing.hasCreative) {
      return 'This campaign is approved and has no uploaded creative, so its creative link cannot be removed. Pause the campaign first.';
    }
  },

  async beforeStatusChange({ db, existing, from, to, admin, reason }) {
    if (to === 'paused') {
      if (from !== 'live' && from !== 'scheduled') return 'Only an approved or live campaign can be paused.';
      return;
    }
    if (to !== 'live' && to !== 'scheduled') return;

    // Approving a draft, re-approving, or resuming a paused campaign.
    const advertiser = await findById(db, 'advertisers', existing.advertiser);
    if (!advertiser) return 'This campaign has no advertiser on record.';
    if (advertiser.status !== 'verified') {
      return `This campaign cannot be approved because its advertiser (${advertiser.businessName}) is not verified. Verify the advertiser first.`;
    }
    const problem = datesProblem(existing.startDate, existing.endDate);
    if (problem) return problem;
    if (!existing.startDate || !existing.endDate) return 'This campaign needs a start date and an end date.';
    if (!hasCreative(existing)) {
      return 'This campaign has no creative. Open the campaign and upload its image (or give a creative link) before approving it.';
    }
    if (hasEnded(existing)) {
      return `This campaign ended on ${day(existing.endDate)}. Change its dates before approving it again.`;
    }
    if (from === 'paused' && !reason) return 'A reason is required to resume a paused campaign.';

    // The stored status follows the dates: an approved campaign is live from its start date.
    const status = hasStarted(existing) ? 'live' : 'scheduled';
    if (status === from) {
      return status === 'scheduled'
        ? `This campaign starts on ${day(existing.startDate)}. It goes live by itself on that date; to start it sooner, change its start date.`
        : 'This campaign is inside its dates, so it is live. To stop it, pause it.';
    }
    const extra: Record<string, any> = { __status: status };
    if (from === 'draft' || from === 'rejected' || from === 'completed') {
      extra.approvedBy = admin.email || null;
      extra.approvedAt = new Date();
    }
    return extra;
  },

  async beforeDelete({ db, existing }) {
    if (['live', 'scheduled'].includes(existing.status)) return 'This campaign is approved. Pause or reject it before deleting it.';
    const invoices = await db.collection('adPayments').countDocuments({ campaign: String(existing._id) });
    if (invoices) return `This campaign has ${invoices} invoice(s), so it cannot be deleted.`;
    await db.collection('adCreatives').deleteMany({ campaignId: String(existing._id) });
    await db.collection('adCampaignStats').deleteMany({ campaignId: String(existing._id) });
    if (existing.application) {
      const application = toObjectId(existing.application);
      if (application) await db.collection('adApplications').updateOne({ _id: application }, { $set: { campaign: null } });
    }
  },
});

/* ----------------------------- billing ---------------------------- */

const LOCKED_WHEN_SETTLED = ['amount', 'gstAmount', 'advertiser', 'campaign'];

registerHooks('ad-payments', {
  async beforeCreate({ db, doc }) {
    if (!(await findById(db, 'advertisers', doc.advertiser))) return 'The selected advertiser does not exist.';
    if (doc.campaign) {
      const campaign = await findById(db, 'adCampaigns', doc.campaign);
      if (!campaign) return 'The selected campaign does not exist.';
      if (campaign.advertiser !== doc.advertiser) return 'The selected campaign belongs to a different advertiser.';
    }
    if (!(Number(doc.amount) > 0)) return 'The amount must be more than zero.';
    doc.total = round2((Number(doc.amount) || 0) + (Number(doc.gstAmount) || 0));
    if (!doc.dueDate) doc.dueDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + INVOICE_DUE_DAYS * DAY_MS);
    if (doc.paidOn) return 'A new invoice is unpaid. Add it first, then change its status to Paid to record the payment.';
    doc.paidOn = null;
    doc.invoiceNumber = await nextInvoiceNumber(db);
  },

  async beforeUpdate({ db, existing, changes }) {
    if (['paid', 'refunded'].includes(existing.status)) {
      const locked = LOCKED_WHEN_SETTLED.filter((key) => key in changes && String(changes[key] ?? '') !== String(existing[key] ?? ''));
      if (locked.length) {
        return `This invoice is ${existing.status} and is in the finance ledger, so its amount, GST, advertiser and campaign cannot be changed.`;
      }
    }
    const advertiserId = changes.advertiser ?? existing.advertiser;
    if ('advertiser' in changes && !(await findById(db, 'advertisers', advertiserId))) return 'The selected advertiser does not exist.';
    const campaignId = 'campaign' in changes ? changes.campaign : existing.campaign;
    if (campaignId) {
      const campaign = await findById(db, 'adCampaigns', campaignId);
      if (!campaign) return 'The selected campaign does not exist.';
      if (campaign.advertiser !== advertiserId) return 'The selected campaign belongs to a different advertiser.';
    }
    const amount = 'amount' in changes ? changes.amount : existing.amount;
    if (!(Number(amount) > 0)) return 'The amount must be more than zero.';
    const gst = 'gstAmount' in changes ? changes.gstAmount : existing.gstAmount;
    changes.total = round2((Number(amount) || 0) + (Number(gst) || 0));
    if ('paidOn' in changes && changes.paidOn && !['paid', 'refunded'].includes(existing.status)) {
      return 'To record a payment, change the status to Paid. "Paid on" can be corrected afterwards.';
    }
  },

  beforeStatusChange({ existing, from, to }) {
    if (from === 'refunded') return 'A refunded invoice is closed. Raise a new invoice instead.';
    if (to === 'refunded' && from !== 'paid') return 'Only a paid invoice can be refunded.';
    if (from === 'paid' && to !== 'refunded') {
      return 'This invoice is paid and is in the finance ledger. It can only be refunded.';
    }
    if (to === 'paid' && !existing.paidOn) return { paidOn: new Date() };
  },

  beforeDelete({ existing }) {
    if (['paid', 'refunded'].includes(existing.status)) {
      return `This invoice is ${existing.status} and is in the finance ledger, so it cannot be deleted.`;
    }
  },
});

/* ------------------------------------------------------------------ */
/* Ledger entries for advertiser invoices                              */
/* ------------------------------------------------------------------ */

async function ledgerForAdPayment(db: any, item: any, status: string, adminEmail: string | null) {
  const { recordManualPayment, recordManualRefund } = await import('../recorded-payments');
  const key = `ad-payment:${item._id}`;
  if (status === 'paid') {
    await recordManualPayment(db, {
      key,
      service: 'advertising',
      amount: Number(item.amount) || 0,
      gstCollected: Number(item.gstAmount) || 0,
      payeeType: 'platform',
      description: `Advertising invoice ${item.invoiceNumber || ''}`.trim(),
      createdBy: adminEmail,
    });
  } else if (status === 'refunded') {
    await recordManualRefund(db, key, `Advertising invoice ${item.invoiceNumber || ''} refunded`.trim(), adminEmail);
  }
}

registerHooks('ad-payments', {
  async afterCreate({ db, item, admin }) {
    await ledgerForAdPayment(db, item, String(item.status), admin.email || null);
  },
  async afterStatusChange({ db, item, to, admin }) {
    await ledgerForAdPayment(db, item, to, admin.email || null);
  },
});
