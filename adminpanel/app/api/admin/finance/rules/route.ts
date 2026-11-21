import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { SERVICES, getCommissionRule } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Commission overview: for every service, the rule in force now, the next
 * scheduled change, every rule on file and the change history from the
 * activity log. A service with no rule in force is returned with
 * `current: null`: no commission is deducted for it.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const now = new Date();

    const rules = await db.collection('commissionRules').find({}).sort({ effectiveFrom: -1 }).limit(1000).toArray();
    // Every commission change on record, including the history of rules that
    // have since been deleted: a deletion must stay visible.
    const logs = await db
      .collection('auditLogs')
      .find({ entityType: 'commission-rules', action: { $ne: 'export' } })
      .sort({ createdAt: -1 })
      .limit(3000)
      .toArray();

    const serviceOf = new Map(rules.map((r) => [String(r._id), String(r.service)]));
    // A deleted rule is no longer in the collection: its service is on its log entries.
    for (const log of [...logs].reverse()) {
      const id = String(log.entityId || '');
      if (!id || serviceOf.has(id)) continue;
      const service = log.before?.service || log.after?.service || log.entityLabel;
      if (SERVICES.some((s) => s.value === service)) serviceOf.set(id, String(service));
    }

    const services = [];
    for (const service of SERVICES) {
      const own = rules.filter((r) => r.service === service.value);
      const current = await getCommissionRule(db, service.value, now);
      const scheduled = own
        .filter((r) => r.status === 'active' && new Date(r.effectiveFrom).getTime() > now.getTime())
        .sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());

      services.push({
        service: service.value,
        label: service.label,
        current: current ? { ...current, _id: String(current._id) } : null,
        next: scheduled[0] ? { ...scheduled[0], _id: String(scheduled[0]._id) } : null,
        rules: own.map((r) => ({ ...r, _id: String(r._id) })),
        history: logs
          .filter((l) => serviceOf.get(String(l.entityId)) === service.value)
          .slice(0, 50)
          .map((l) => ({ ...l, _id: String(l._id) })),
      });
    }

    return ok({ services, now, canManage: can(check.admin, 'finance:manage') });
  } catch (error) {
    console.error('Load commission overview failed:', error);
    return fail('Failed to load the commission rules', 500);
  }
}
