import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { OPEN_CASE_STATUSES, runRiskChecks } from '@/lib/risk';
import { logServerError } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Opens a risk case from a signal. The signal is looked up again on the
 * server, so the evidence stored on the case is what the detector produced,
 * not what the browser sent. Opening a case does not restrict any account.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'fraud:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const signalKey = asString(body.signalKey, 300);
    if (!signalKey) return fail('signalKey is required');

    const title = asString(body.title, 200);
    const note = asString(body.note, 4000);
    const assignedTo = asString(body.assignedTo, 200).toLowerCase();
    if (assignedTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignedTo)) return fail('Assigned to is not a valid email');

    const { db } = await connectToDatabase();

    const existing = await db.collection('riskCases').findOne({ signalKey, status: { $in: OPEN_CASE_STATUSES } });
    if (existing) {
      return fail('This signal already has an open case.', 409, { caseId: String(existing._id) });
    }

    const run = await runRiskChecks(db);
    const signal = run.groups.flatMap((g) => g.signals).find((s) => s.key === signalKey);
    if (!signal) return fail('That signal is no longer present. Run the checks again.', 404);

    if (assignedTo) {
      const assignee = await db.collection('admins').findOne({ email: assignedTo }, { projection: { _id: 1 } });
      if (!assignee) return fail('No admin account has that email address');
    }

    const now = new Date();
    const doc: Record<string, any> = {
      title: title || `${signal.title}: ${signal.subjectLabel}`.slice(0, 200),
      type: signal.group,
      subjectType: signal.subjectType,
      subjectId: signal.subjectId,
      subjectLabel: signal.subjectLabel,
      severity: signal.severity,
      evidenceSummary: signal.evidence,
      assignedTo: assignedTo || null,
      outcome: null,
      signalKey: signal.key,
      signalDetector: signal.detector,
      subjectHref: signal.href,
      relatedAccounts: signal.related || [],
      status: 'open',
      notes: note
        ? [{ text: note, by: check.admin.email || null, byName: check.admin.name || null, at: now }]
        : [],
      createdAt: now,
      updatedAt: now,
      createdBy: check.admin.email || null,
      updatedBy: check.admin.email || null,
    };

    const result = await db.collection('riskCases').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'fraud',
      entityType: 'risk-cases',
      entityId: String(result.insertedId),
      entityLabel: doc.title,
      after: { ...doc, notes: undefined, relatedAccounts: undefined },
      reason: note || null,
      meta: { openedFromSignal: signal.key },
      request,
    });

    return ok({ id: String(result.insertedId), item: { ...doc, _id: String(result.insertedId) } }, { status: 201 });
  } catch (error) {
    console.error('Opening a risk case failed:', error);
    await logServerError('fraud.cases', error, request.nextUrl.pathname);
    return fail('Could not open the case', 500);
  }
}
