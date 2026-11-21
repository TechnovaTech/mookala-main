/** Server-side rules for the legal resources. Server only. */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { logAudit } from '../audit';

function same(a: any, b: any): boolean {
  const norm = (v: any) => (v === undefined || v === '' ? null : v instanceof Date ? v.getTime() : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

const POLICY_FIELDS = ['title', 'type', 'version', 'effectiveDate', 'body'];

registerHooks('policies', {
  async beforeCreate({ db, doc }) {
    doc.version = String(doc.version || '').trim();
    const clash = await db.collection('policies').findOne({ type: doc.type, version: doc.version }, { projection: { _id: 1 } });
    if (clash) return `Version ${doc.version} of this policy type already exists. Use a new version number.`;
  },

  async beforeUpdate({ db, existing, changes }) {
    const touched = POLICY_FIELDS.filter((key) => key in changes && !same(existing[key], changes[key]));
    if (touched.length === 0) return;
    if (existing.status === 'published') {
      return 'A published policy cannot be edited, because people have agreed to this exact text. Add a new version and publish that instead.';
    }
    if (existing.status === 'archived') {
      return 'An archived policy is kept as a record of what was in force and cannot be edited. Add a new version instead.';
    }
    const merged = { ...existing, ...changes };
    const clash = await db
      .collection('policies')
      .findOne({ type: merged.type, version: String(merged.version).trim(), _id: { $ne: existing._id } }, { projection: { _id: 1 } });
    if (clash) return `Version ${merged.version} of this policy type already exists. Use a new version number.`;
  },

  async beforeStatusChange({ db, existing, from, to, admin }) {
    if (to === 'draft') {
      return from === 'published'
        ? 'A published policy cannot go back to draft. Archive it, or publish a new version, which archives this one.'
        : 'An archived policy cannot go back to draft. Add a new version instead.';
    }
    if (to === 'archived' && from === 'draft') return 'A draft has never been in force, so it cannot be archived. Delete it instead.';
    if (to !== 'published') return { archivedAt: new Date() };

    if (!String(existing.body || '').trim()) return 'Write the policy text before publishing.';

    // One published version per type: publishing this one archives the previous one.
    const now = new Date();
    const previous = await db
      .collection('policies')
      .find({ type: existing.type, status: 'published', _id: { $ne: existing._id } })
      .toArray();
    for (const old of previous) {
      await db.collection('policies').updateOne(
        { _id: old._id },
        {
          $set: {
            status: 'archived',
            statusReason: `Replaced by version ${existing.version}`,
            statusChangedAt: now,
            statusChangedBy: admin.email || null,
            archivedAt: now,
            supersededBy: String(existing._id),
            updatedAt: now,
            updatedBy: admin.email || null,
          },
        }
      );
      await logAudit({
        admin,
        action: 'status_change',
        module: 'legal',
        entityType: 'policies',
        entityId: String(old._id),
        entityLabel: old.title,
        before: { status: 'published' },
        after: { status: 'archived' },
        reason: `Replaced by version ${existing.version}`,
      });
    }
    return { publishedAt: now, publishedBy: admin.email || null, archivedAt: null };
  },
});

/* ------------------------------------------------------------------ */
/* Consent records                                                     */
/* ------------------------------------------------------------------ */

registerHooks('consent-records', {
  beforeStatusChange({ to }) {
    return to === 'withdrawn' ? { withdrawnAt: new Date() } : { withdrawnAt: null };
  },
});

/* ------------------------------------------------------------------ */
/* Deletion requests                                                   */
/* ------------------------------------------------------------------ */

const DELETION_TRANSITIONS: Record<string, string[]> = {
  requested: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected', 'requested'],
  approved: ['completed', 'under_review'],
  rejected: ['under_review'],
  completed: [],
};

registerHooks('deletion-requests', {
  beforeUpdate({ existing }) {
    if (existing.status === 'completed') return 'A completed deletion request is a closed record and cannot be edited.';
  },

  beforeStatusChange({ existing, from, to }) {
    if (!(DELETION_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'completed') return 'Only an approved request can be completed.';
      if (to === 'approved') return 'A request must be under review before it can be approved.';
      return `A deletion request cannot move from "${from}" to "${to}".`;
    }
    if ((to === 'approved' || to === 'completed') && existing.legalHold === true) {
      return 'This request is under legal hold, so the data must be kept. Remove the legal hold before approving or completing it.';
    }
    if (to === 'completed' && !String(existing.outcome || '').trim()) {
      return 'Record the outcome first: open "Review affected records" for this request, act on the records, and save what was done.';
    }
    if (to === 'approved') return { approvedAt: new Date() };
  },
});

/* ------------------------------------------------------------------ */
/* What a deletion request would touch                                 */
/* ------------------------------------------------------------------ */

type Treatment = 'erase' | 'review' | 'keep';

interface Source {
  collection: string;
  label: string;
  fields: string[];
  treatment: Treatment;
  note: string;
}

/** Every place a phone number ties a record to a person. */
const SOURCES: Source[] = [
  { collection: 'users', label: 'Customer profile', fields: ['phone'], treatment: 'erase', note: 'Name, email, city, photo and followed artists.' },
  { collection: 'artists', label: 'Artist profile', fields: ['phone'], treatment: 'erase', note: 'Profile, portfolio media and KYC documents.' },
  { collection: 'organizers', label: 'Organiser profile', fields: ['phone'], treatment: 'erase', note: 'Profile and KYC documents.' },
  { collection: 'hireRequests', label: 'Hire requests', fields: ['userPhone'], treatment: 'erase', note: 'Requests the person raised to hire a professional.' },
  { collection: 'feedback', label: 'Feedback and ratings', fields: ['customerPhone'], treatment: 'erase', note: 'Or remove the name and phone and keep the rating.' },
  { collection: 'referrals', label: 'Referrals', fields: ['referrerPhone', 'referredPhone'], treatment: 'erase', note: 'Referral links to or from this person.' },
  { collection: 'notificationLogs', label: 'Message delivery log', fields: ['to'], treatment: 'erase', note: 'Messages addressed to this number.' },
  { collection: 'supportCases', label: 'Complaints and support tickets', fields: ['customerPhone'], treatment: 'review', note: 'Keep while a case is open or disputed.' },
  { collection: 'userReports', label: 'Reports about or by this person', fields: ['reportedPhone', 'reporterPhone'], treatment: 'review', note: 'Keep where a report concerns fraud or abuse.' },
  { collection: 'consentRecords', label: 'Consent records', fields: ['subjectPhone'], treatment: 'review', note: 'Usually kept as proof of what was agreed.' },
  { collection: 'couponRedemptions', label: 'Coupon redemptions', fields: ['userPhone'], treatment: 'keep', note: 'Part of the booking\'s financial record.' },
  { collection: 'bookings', label: 'Bookings', fields: ['userPhone'], treatment: 'keep', note: 'Financial record: kept.' },
  { collection: 'transactions', label: 'Ledger entries', fields: ['customerPhone'], treatment: 'keep', note: 'Financial record: kept. The ledger is append-only.' },
  { collection: 'refunds', label: 'Refunds', fields: ['customerPhone'], treatment: 'keep', note: 'Financial record: kept.' },
];

/** The same number as it may have been stored: 10 digits, with 91, with +91. */
function phoneVariants(phone: string): string[] {
  const digits = String(phone || '').replace(/\D/g, '');
  const variants = new Set<string>([String(phone || '').trim(), digits]);
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    variants.add(last10);
    variants.add('91' + last10);
    variants.add('+91' + last10);
  }
  variants.delete('');
  return Array.from(variants);
}

export async function deletionImpact(db: Db, phone: string) {
  const variants = phoneVariants(phone);
  const rows = [];

  for (const source of SOURCES) {
    const filter = source.fields.length === 1 ? { [source.fields[0]]: { $in: variants } } : { $or: source.fields.map((f) => ({ [f]: { $in: variants } })) };
    const count = await db.collection(source.collection).countDocuments(filter);
    rows.push({ collection: source.collection, label: source.label, matchedOn: source.fields.join(' or '), count, treatment: source.treatment, note: source.note });
  }

  // Records tied to the person's artist or organiser account rather than to the phone.
  const accounts = [
    ...(await db.collection('artists').find({ phone: { $in: variants } }, { projection: { _id: 1 } }).toArray()),
    ...(await db.collection('organizers').find({ phone: { $in: variants } }, { projection: { _id: 1 } }).toArray()),
  ];
  if (accounts.length) {
    const ids = accounts.flatMap((a) => [a._id, String(a._id)]);
    rows.push({
      collection: 'events',
      label: 'Events created by this account',
      matchedOn: 'organizerId',
      count: await db.collection('events').countDocuments({ organizerId: { $in: ids } }),
      treatment: 'review' as Treatment,
      note: 'Events with bookings are part of the financial record.',
    });
    rows.push({
      collection: 'settlements',
      label: 'Settlements and payouts',
      matchedOn: 'payeeId',
      count: await db.collection('settlements').countDocuments({ payeeId: { $in: ids.map(String) } }),
      treatment: 'keep' as Treatment,
      note: 'Financial record: kept.',
    });
  }

  return { phoneFormsChecked: variants, rows };
}
