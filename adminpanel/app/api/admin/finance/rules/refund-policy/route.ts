import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { SERVICES } from '@/lib/ledger';
import { describePolicy, orderRules } from '@/lib/refund-rules';
import { getFinanceSettings, refundApprovalLimit } from '../../settings/store';

export const dynamic = 'force-dynamic';

/**
 * The refund policy in force for every service, worked out from the active
 * rules with the same code a real cancellation uses: the windows a customer
 * falls into, which rule wins where rules overlap, the hours no rule covers,
 * and the amount above which a refund needs a second approver.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'refunds:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const [rules, settings] = await Promise.all([
      db.collection('refundRules').find({ status: 'active' }).limit(1000).toArray(),
      getFinanceSettings(db),
    ]);

    const services = SERVICES.map((service) => {
      const active = orderRules(rules.filter((r) => r.service === service.value) as any[]);
      const policy = describePolicy(active);
      return {
        service: service.value,
        label: service.label,
        activeRules: active.map((r: any) => ({
          _id: String(r._id),
          name: r.name || '',
          minHoursBefore: Number(r.minHoursBefore) || 0,
          maxHoursBefore: r.maxHoursBefore == null ? null : Number(r.maxHoursBefore),
          refundPercent: Number(r.refundPercent) || 0,
          deductionFlat: Number(r.deductionFlat) || 0,
        })),
        windows: policy.windows,
        overlaps: policy.overlaps,
        approvalLimit: refundApprovalLimit(settings, service.value),
      };
    });

    return ok({ services });
  } catch (error) {
    console.error('Load refund policy failed:', error);
    return fail('Failed to load the refund policy', 500);
  }
}
