import { NextRequest } from 'next/server';
import type { Db, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, csvResponse, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { payeeBalance, recordTransaction, roundMoney, SERVICES, type Service } from '@/lib/ledger';
import { getFinanceSettings } from '../../settings/store';
import { serialiseDoc } from '../shared';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  pending: 'pending',
  awaiting_second_approval: 'awaiting second approval',
  approved: 'approved',
  paid: 'paid',
  failed: 'failed',
  on_hold: 'on hold',
};

const IST_OFFSET_MS = 330 * 60000;

const RACE = 'This settlement was changed by someone else a moment ago. Reload it and try again.';
const PAID_LOCKED = 'A paid settlement is a permanent record. It cannot be edited or deleted.';

/** A period boundary as the day the admin chose: India days, or UTC days on older settlements. */
function periodDay(settlement: any, value: any): string {
  const shift = settlement.periodTimezone === 'Asia/Kolkata' ? IST_OFFSET_MS : 0;
  return new Date(new Date(value).getTime() + shift).toISOString().slice(0, 10);
}

function wrongStatus(action: string, status: string) {
  return fail(`A settlement that is ${LABEL[status] || status} cannot be ${action}.`, 409);
}

async function coveredEntries(db: Db, settlement: any) {
  const references: string[] = (settlement.entryReferences || []).map(String);
  if (references.length === 0) return [];
  return db.collection('transactions').find({ reference: { $in: references } }).sort({ createdAt: 1 }).toArray();
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'settlements:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid settlement ID', 400);

  try {
    const { db } = await connectToDatabase();
    const settlement = await db.collection('settlements').findOne({ _id: oid });
    if (!settlement) return fail('Settlement not found', 404);

    // Downloadable statement: the ledger entries this settlement covers.
    if (request.nextUrl.searchParams.get('statement') === 'csv') {
      const entries = await coveredEntries(db, settlement);
      const rows: Record<string, any>[] = entries.map((e) => ({
        date: e.createdAt,
        reference: e.reference,
        type: e.type,
        service: e.service,
        bookingId: e.bookingId || '',
        eventId: e.eventId || '',
        customerPhone: e.customerPhone || '',
        gatewayPaymentId: e.gatewayPaymentId || '',
        parentReference: e.parentReference || '',
        // Two positive columns: lib/http's CSV writer quotes values that start with "-".
        credit: e.type === 'payment' ? e.amount : '',
        debit: e.type === 'payment' ? '' : e.amount,
        description: e.description || '',
      }));
      const credit = (label: string, value: number) => ({ type: label, credit: value });
      const debit = (label: string, value: number) => ({ type: label, debit: value });
      rows.push(
        credit('TOTAL gross payments', settlement.grossAmount),
        debit('TOTAL commission', settlement.commissionAmount),
        debit('TOTAL GST', settlement.gstAmount),
        debit('TOTAL gateway fees', settlement.gatewayFeeAmount),
        debit('TOTAL refunds', settlement.refundsAmount),
        credit('NET PAYABLE', settlement.netAmount)
      );

      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'settlements',
        entityType: 'settlement',
        entityId: params.id,
        entityLabel: settlement.payeeName || settlement.payeeId,
        meta: { statement: true, rows: entries.length },
        request,
      });

      const name = String(settlement.payeeName || settlement.payeeId).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40);
      // The period as the admin chose it: India days, or UTC days on older settlements.
      const shift = settlement.periodTimezone === 'Asia/Kolkata' ? IST_OFFSET_MS : 0;
      const day = (value: any) => new Date(new Date(value).getTime() + shift).toISOString().slice(0, 10);
      const stamp = (value: any) => new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') + ' IST';
      const settings = await getFinanceSettings(db);
      const header = (label: string, value: any) => toCsv([], [{ key: 'a', label }, { key: 'b', label: String(value ?? '') }]);
      const rules: string[] = (settlement.rulesApplied || []).map(
        (r: any) =>
          `${r.service}: ${r.payoutSchedule || 'no'} payout schedule (${r.scheduleSource}); ` +
          (r.eligibilityDays == null ? 'no eligibility wait' : `payable ${r.eligibilityDays} days after the event (${r.eligibilitySource})`)
      );
      const head = [
        header('Statement', 'Settlement statement'),
        header('Payee', `${settlement.payeeName || settlement.payeeId} (${settlement.payeeType})`),
        header('Period', `${day(settlement.periodFrom)} to ${day(settlement.periodTo)}${shift ? '' : ' (UTC days)'}`),
        header('Time zone', 'Asia/Kolkata'),
        header('Generated at', stamp(new Date())),
        header('Platform GST number', settings.gstNumber || 'Not configured'),
        header('Status', LABEL[String(settlement.status)] || settlement.status),
        ...(settlement.bankReference ? [header('Bank reference', settlement.bankReference)] : []),
        ...(rules.length ? [header('Settlement rule applied', rules.join(' | '))] : []),
        '',
      ].join('\r\n');
      for (const row of rows) if (row.date) row.date = stamp(row.date);
      return csvResponse(
        head +
          '\r\n' +
          toCsv(rows, [
            { key: 'date', label: 'Date (India time)' },
            { key: 'reference', label: 'Ledger reference' },
            { key: 'type', label: 'Type' },
            { key: 'service', label: 'Service' },
            { key: 'bookingId', label: 'Booking ID' },
            { key: 'eventId', label: 'Event ID' },
            { key: 'customerPhone', label: 'Customer phone' },
            { key: 'gatewayPaymentId', label: 'Gateway payment ID' },
            { key: 'parentReference', label: 'Payment reference' },
            { key: 'credit', label: 'Added to payout' },
            { key: 'debit', label: 'Taken from payout' },
            { key: 'description', label: 'Description' },
          ]),
        `settlement-${name}-${day(settlement.periodFrom)}-to-${day(settlement.periodTo)}.csv`
      );
    }

    const [entries, history, settings, balance, payout] = await Promise.all([
      coveredEntries(db, settlement),
      db.collection('auditLogs').find({ entityType: 'settlement', entityId: params.id }).sort({ createdAt: -1 }).limit(100).toArray(),
      getFinanceSettings(db),
      payeeBalance(db, String(settlement.payeeType), String(settlement.payeeId)),
      db.collection('transactions').findOne({ type: 'settlement', 'meta.settlementId': params.id }),
    ]);

    const threshold = settings.payoutSecondApprovalAbove;
    const { entryReferences, ...rest } = settlement;

    return ok({
      settlement: serialiseDoc(rest as any),
      entries: entries.slice(0, 500).map(serialiseDoc),
      entryTotal: entries.length,
      payout: payout ? serialiseDoc(payout) : null,
      history: history.map(serialiseDoc),
      balance,
      secondApprovalAbove: threshold,
      needsSecondApproval: threshold !== null && Number(settlement.netAmount) > threshold,
      canManage: can(check.admin, 'settlements:manage'),
      canApprove: can(check.admin, 'settlements:approve'),
      isFirstApprover: Boolean(settlement.firstApprover && settlement.firstApprover === check.admin.email),
    });
  } catch (error) {
    console.error('Load settlement failed:', error);
    return fail('Failed to load the settlement', 500);
  }
}

async function move(db: Db, id: ObjectId, from: string[], set: Record<string, any>, extraFilter: Record<string, any> = {}) {
  const result = await db
    .collection('settlements')
    .updateOne({ _id: id, status: { $in: from }, ...extraFilter }, { $set: { ...set, updatedAt: new Date() } });
  return result.modifiedCount === 1;
}

/**
 * POST { action, reason?, bankReference? }
 *   approve | hold | release | paid | failed
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'settlements:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid settlement ID', 400);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const action = asString(body.action, 30);
    const reason = asString(body.reason);
    const { db } = await connectToDatabase();
    const settlements = db.collection('settlements');
    const settlement = await settlements.findOne({ _id: oid });
    if (!settlement) return fail('Settlement not found', 404);

    const status = String(settlement.status);
    const net = roundMoney(Number(settlement.netAmount) || 0);
    const email = admin.email || null;
    const now = new Date();

    const audit = (name: string, after: Record<string, any>, why: string | null, meta?: Record<string, any>) =>
      logAudit({
        admin,
        action: name,
        module: 'settlements',
        entityType: 'settlement',
        entityId: params.id,
        entityLabel: settlement.payeeName || settlement.payeeId,
        before: { status },
        after,
        reason: why,
        meta: { netAmount: net, ...(meta || {}) },
        request,
      });

    const done = async () => {
      const updated = await settlements.findOne({ _id: oid }, { projection: { entryReferences: 0 } });
      return ok({ settlement: serialiseDoc(updated!), status: updated!.status });
    };

    if (status === 'paid') return fail(PAID_LOCKED, 409);

    if (action === 'approve') {
      if (!can(admin, 'settlements:approve')) return fail('Approving a payout needs the settlement approver permission.', 403);
      if (!email) return fail('Your admin account has no email, so the approval cannot be recorded.', 403);

      if (status === 'pending') {
        const settings = await getFinanceSettings(db);
        const threshold = settings.payoutSecondApprovalAbove;
        const needsSecond = threshold !== null && net > threshold;
        const next = needsSecond ? 'awaiting_second_approval' : 'approved';
        const moved = await move(db, oid, ['pending'], {
          status: next,
          firstApprover: email,
          firstApprovedAt: now,
          secondApprover: null,
          secondApprovedAt: null,
          approvalThreshold: threshold,
        });
        if (!moved) return fail(RACE, 409);
        await audit('approve', { status: next, firstApprover: email }, reason || null, { threshold });
        return done();
      }

      if (status === 'awaiting_second_approval') {
        if (settlement.firstApprover === email) {
          return fail('You gave the first approval. A different admin must give the second approval.', 403);
        }
        const moved = await move(
          db,
          oid,
          ['awaiting_second_approval'],
          { status: 'approved', secondApprover: email, secondApprovedAt: now },
          { firstApprover: { $ne: email } }
        );
        if (!moved) return fail(RACE, 409);
        await audit('second_approve', { status: 'approved', secondApprover: email }, reason || null);
        return done();
      }

      return wrongStatus('approved', status);
    }

    if (action === 'hold') {
      if (reason.length < 5) return fail('A written reason is required to put a settlement on hold');
      const from = ['pending', 'awaiting_second_approval', 'approved'];
      if (!from.includes(status)) return wrongStatus('put on hold', status);
      const moved = await move(db, oid, from, { status: 'on_hold', heldBy: email, heldAt: now, holdReason: reason });
      if (!moved) return fail(RACE, 409);
      await audit('hold', { status: 'on_hold' }, reason);
      return done();
    }

    if (action === 'release') {
      if (status !== 'on_hold') return wrongStatus('released', status);
      // A released settlement goes back to the start and is approved again.
      const moved = await move(db, oid, ['on_hold'], {
        status: 'pending',
        firstApprover: null,
        secondApprover: null,
        firstApprovedAt: null,
        secondApprovedAt: null,
        releasedBy: email,
        releasedAt: now,
      });
      if (!moved) return fail(RACE, 409);
      await audit('release', { status: 'pending' }, reason || null);
      return done();
    }

    if (action === 'failed') {
      if (reason.length < 5) return fail('A written reason is required to mark a payout as failed');
      const from = ['approved', 'on_hold'];
      if (!from.includes(status)) return wrongStatus('marked as failed', status);
      const moved = await move(db, oid, from, { status: 'failed', failedBy: email, failedAt: now, failureReason: reason });
      if (!moved) return fail(RACE, 409);
      await audit('failed', { status: 'failed' }, reason);
      return done();
    }

    if (action === 'paid') {
      const bankReference = asString(body.bankReference, 120);
      if (bankReference.length < 3) return fail('The bank reference of the payout is required');
      if (status !== 'approved') {
        return fail(`Only an approved settlement can be marked as paid. This one is ${LABEL[status] || status}.`, 409);
      }
      if (net <= 0) return fail('This settlement has nothing to pay.', 409);

      const transactions = db.collection('transactions');
      const already = await transactions.findOne({ type: 'settlement', 'meta.settlementId': params.id });

      const covered: string[] = Array.isArray(settlement.entryReferences) ? settlement.entryReferences.map(String) : [];
      if (!already && covered.length) {
        const disputed = await transactions.countDocuments({ reference: { $in: covered }, status: 'disputed' });
        if (disputed > 0) {
          return fail(
            `${disputed} of the payments in this settlement are under dispute. Put the settlement on hold until the disputes are settled.`,
            409
          );
        }
      }

      if (!already) {
        const balance = await payeeBalance(db, String(settlement.payeeType), String(settlement.payeeId));
        if (net > balance.pending) {
          return fail(
            `This payout (₹${net}) is more than the payee's pending balance (₹${balance.pending}). ` +
              'Refunds since it was created have reduced what is owed. Mark it failed and create a new settlement.',
            409
          );
        }
      }

      const claimed = await move(db, oid, ['approved'], { status: 'paid', bankReference, paidAt: now, paidBy: email });
      if (!claimed) return fail(RACE, 409);

      try {
        const service = (SERVICES.some((s) => s.value === settlement.ledgerService) ? settlement.ledgerService : 'ticketing') as Service;
        const entry =
          already ||
          (await recordTransaction(db, {
            type: 'settlement',
            service,
            amount: net,
            status: 'success',
            payeeType: settlement.payeeType,
            payeeId: String(settlement.payeeId),
            payeeName: settlement.payeeName || null,
            description: `Payout for ${periodDay(settlement, settlement.periodFrom)} to ${periodDay(settlement, settlement.periodTo)}`,
            createdBy: email,
            meta: { settlementId: params.id, bankReference },
          }));
        await settlements.updateOne({ _id: oid }, { $set: { ledgerReference: entry.reference, updatedAt: new Date() } });
        await audit('paid', { status: 'paid', bankReference, ledgerReference: entry.reference }, reason || null);
      } catch (ledgerError) {
        console.error('Settlement ledger write failed:', ledgerError);
        await settlements.updateOne(
          { _id: oid },
          { $set: { status: 'approved', bankReference: null, paidAt: null, paidBy: null, updatedAt: new Date() } }
        );
        return fail('The ledger entry could not be written, so the settlement was not marked as paid. Try again.', 500);
      }
      return done();
    }

    return fail('Unknown action');
  } catch (error) {
    console.error('Settlement action failed:', error);
    return fail('Failed to update the settlement', 500);
  }
}

/** PUT { notes, reason }: the notes are the only editable part; the amounts come from the ledger. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'settlements:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid settlement ID', 400);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { db } = await connectToDatabase();
    const settlement = await db.collection('settlements').findOne({ _id: oid }, { projection: { entryReferences: 0 } });
    if (!settlement) return fail('Settlement not found', 404);
    if (settlement.status === 'paid') return fail(PAID_LOCKED, 409);

    const notes = asString(body.notes, 2000) || null;
    const reason = asString(body.reason);
    if ((settlement.notes || null) === notes) return ok({ settlement: serialiseDoc(settlement), unchanged: true });

    const result = await db
      .collection('settlements')
      .updateOne({ _id: oid, status: { $ne: 'paid' } }, { $set: { notes, updatedAt: new Date(), updatedBy: check.admin.email || null } });
    if (result.modifiedCount !== 1) return fail(PAID_LOCKED, 409);

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'settlements',
      entityType: 'settlement',
      entityId: params.id,
      entityLabel: settlement.payeeName || settlement.payeeId,
      before: { notes: settlement.notes || null },
      after: { notes },
      reason: reason || null,
      request,
    });

    const updated = await db.collection('settlements').findOne({ _id: oid }, { projection: { entryReferences: 0 } });
    return ok({ settlement: serialiseDoc(updated!) });
  } catch (error) {
    console.error('Update settlement failed:', error);
    return fail('Failed to save the settlement', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'settlements:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid settlement ID', 400);

  try {
    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason);
    if (reason.length < 5) return fail('A written reason is required to delete a settlement');

    const { db } = await connectToDatabase();
    const settlement = await db.collection('settlements').findOne({ _id: oid }, { projection: { entryReferences: 0 } });
    if (!settlement) return fail('Settlement not found', 404);
    if (settlement.status === 'paid') return fail(PAID_LOCKED, 409);

    const result = await db.collection('settlements').deleteOne({ _id: oid, status: { $ne: 'paid' } });
    if (result.deletedCount !== 1) return fail(PAID_LOCKED, 409);

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'settlements',
      entityType: 'settlement',
      entityId: params.id,
      entityLabel: settlement.payeeName || settlement.payeeId,
      before: settlement,
      reason,
      request,
    });

    return ok({});
  } catch (error) {
    console.error('Delete settlement failed:', error);
    return fail('Failed to delete the settlement', 500);
  }
}
