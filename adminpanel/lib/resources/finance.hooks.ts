/** Server-side hooks for the finance resources: commission rules and refund rules. */
import type { Db } from 'mongodb';
import { registerHooks, type HookRequestContext } from '../resource-hooks';
import { diff, logAudit } from '../audit';
import { SERVICES } from '../ledger';
import { approvalHeldResponse, gateSensitiveAction } from '../approvals';
import { clientIp } from '../auth';
import type { AdminIdentity } from '../permissions';

const MIN_REASON = 5;

function validService(value: unknown): boolean {
  return SERVICES.some((s) => s.value === value);
}

function sameValue(a: any, b: any): boolean {
  if (a instanceof Date || b instanceof Date) {
    const left = a ? new Date(a).getTime() : null;
    const right = b ? new Date(b).getTime() : null;
    return left === right;
  }
  return (a ?? null) === (b ?? null);
}

/**
 * The reason for an edit comes either from `_reason` in the request or from
 * the "Reason for this change" field, which must then differ from the reason
 * stored with the previous change.
 */
function editReason(ctx: { existing: any; changes: Record<string, any>; reason: string }): string {
  const explicit = (ctx.reason || '').trim();
  if (explicit.length >= MIN_REASON) return explicit;
  const typed = typeof ctx.changes.changeReason === 'string' ? ctx.changes.changeReason.trim() : '';
  if (typed.length >= MIN_REASON && typed !== String(ctx.existing.changeReason || '').trim()) return typed;
  return '';
}

/* ------------------------------------------------------------------ */
/* Second approver                                                     */
/* ------------------------------------------------------------------ */

/** Fields the server sets itself; they are not part of the change an approver looks at. */
const SERVER_FIELDS = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

function withoutServerFields(doc: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc)) if (!SERVER_FIELDS.includes(key)) out[key] = value;
  return out;
}

/**
 * Holds a commission or refund rule change for a second approver when the
 * security settings ask for one (actions "commission_rules" and
 * "refund_rules"). Called by each hook after its own checks have passed and
 * immediately before the write. Returns undefined to let the write go ahead,
 * or the response to send instead (202 sent for approval, or 400/409).
 */
async function holdForApproval(
  ctx: { db: Db; admin: AdminIdentity } & HookRequestContext,
  input: {
    action: 'commission_rules' | 'refund_rules';
    resource: 'commission-rules' | 'refund-rules';
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    id: string | null;
    label: string;
    before: any;
    after: any;
    payload: any;
    reason: string;
  }
): Promise<Response | undefined> {
  // The request that performs the change, kept (encrypted) so the Approvals screen can carry it out.
  const body: Record<string, any> = { ...(ctx.body || {}) };
  delete body._approvalId;
  const result = await gateSensitiveAction(ctx.db, {
    action: input.action,
    admin: ctx.admin,
    entityType: input.resource,
    entityId: input.id,
    entityLabel: input.label,
    before: input.before,
    after: input.after,
    payload: { method: input.method, ...input.payload },
    reason: input.reason,
    approvalId: ctx.approvalId || null,
    replay: { method: input.method, path: `/api/admin/r/${input.resource}${input.id ? '/' + input.id : ''}`, body },
    ip: ctx.request ? clientIp(ctx.request) : null,
    userAgent: ctx.request?.headers.get('user-agent') || null,
  });
  return result.proceed ? undefined : approvalHeldResponse(result);
}

function ruleLabel(doc: any, kind: 'commission' | 'refund'): string {
  const service = SERVICES.find((s) => s.value === doc?.service)?.label || doc?.service || 'unknown service';
  return kind === 'commission' ? `${service} commission rule (${doc?.ratePercent ?? '?'}%)` : `${doc?.name || 'Refund rule'} (${service})`;
}

/* ------------------------------------------------------------------ */
/* Commission rules                                                    */
/* ------------------------------------------------------------------ */

const COMMISSION_LOCKED = ['service', 'ratePercent', 'minFee', 'maxFee', 'gstPercent', 'gatewayFeePercent', 'effectiveFrom'];

function commissionProblem(doc: Record<string, any>): string | null {
  if (!validService(doc.service)) return 'Choose a service for this rule';
  if (doc.minFee != null && doc.maxFee != null && doc.maxFee > 0 && doc.minFee > doc.maxFee) {
    return 'The minimum fee cannot be higher than the maximum commission';
  }
  if (!doc.effectiveFrom || Number.isNaN(new Date(doc.effectiveFrom).getTime())) return 'Effective from is required';
  return null;
}

registerHooks('commission-rules', {
  async beforeCreate(ctx) {
    const { doc } = ctx;
    const reason = typeof doc.changeReason === 'string' ? doc.changeReason.trim() : '';
    if (reason.length < MIN_REASON) return 'A written reason is required to create a commission rule';
    doc.changeReason = reason;
    const problem = commissionProblem(doc);
    if (problem) return problem;
    const proposed = withoutServerFields(doc);
    return holdForApproval(ctx, {
      action: 'commission_rules',
      resource: 'commission-rules',
      method: 'POST',
      id: null,
      label: ruleLabel(doc, 'commission'),
      before: null,
      after: proposed,
      payload: { doc: proposed },
      reason,
    });
  },

  async beforeUpdate(ctx) {
    const reason = editReason(ctx);
    if (!reason) return 'A written reason is required to change a commission rule';

    // A rule can be corrected in any status. The change needs a reason and is
    // written to the activity log with the old and new values. Payments already
    // taken keep the rate they were charged: each ledger entry stores its own
    // copy of the rule that was applied.
    const merged = { ...ctx.existing, ...ctx.changes };
    const problem = commissionProblem(merged);
    if (problem) return problem;

    // Two active rules of one service with the same effective date would make
    // "the rule in force" a matter of chance.
    if (ctx.existing.status === 'active') {
      const clash = await ctx.db.collection('commissionRules').findOne({
        _id: { $ne: ctx.existing._id },
        service: merged.service,
        status: 'active',
        effectiveFrom: new Date(merged.effectiveFrom),
      });
      if (clash) return 'Another active rule for this service has the same effective date. Choose a different date or retire the other rule.';
    }
    const changed = diff(ctx.existing, merged);
    if (Object.keys(changed.after).length > 0) {
      const held = await holdForApproval(ctx, {
        action: 'commission_rules',
        resource: 'commission-rules',
        method: 'PUT',
        id: String(ctx.existing._id),
        label: ruleLabel(merged, 'commission'),
        before: changed.before,
        after: changed.after,
        payload: { changes: { ...ctx.changes } },
        reason,
      });
      if (held) return held;
    }
    ctx.changes.changeReason = reason;
    // When this change starts to count: at once for a rule already in force,
    // on its effective date for a scheduled rule, and not at all for a draft.
    const now = new Date();
    const effective = new Date(merged.effectiveFrom);
    ctx.changes.changeAppliesFrom = ctx.existing.status === 'active' ? (effective.getTime() > now.getTime() ? effective : now) : null;
  },

  async beforeDelete(ctx) {
    if (ctx.reason.trim().length < MIN_REASON) return 'A written reason is required to delete a commission rule';
    return holdForApproval(ctx, {
      action: 'commission_rules',
      resource: 'commission-rules',
      method: 'DELETE',
      id: String(ctx.existing._id),
      label: ruleLabel(ctx.existing, 'commission'),
      before: withoutServerFields(ctx.existing),
      after: null,
      payload: { delete: true },
      reason: ctx.reason.trim(),
    });
  },

  async beforeStatusChange(ctx) {
    const { db, existing, from, to, admin, reason } = ctx;
    if (reason.trim().length < MIN_REASON) return 'A written reason is required to change the status of a commission rule';
    const now = new Date();

    if (from === 'retired') return 'A retired rule cannot be brought back. Create a new rule instead.';

    // Held for a second approver once the change has passed its own checks, immediately before it is written.
    const hold = () =>
      holdForApproval(ctx, {
        action: 'commission_rules',
        resource: 'commission-rules',
        method: 'PATCH',
        id: String(existing._id),
        label: ruleLabel(existing, 'commission'),
        before: { status: from },
        after: { status: to },
        payload: { from, to },
        reason: reason.trim(),
      });

    if (to === 'draft') {
      if (new Date(existing.effectiveFrom).getTime() <= now.getTime()) {
        return 'This rule has already been in force and cannot go back to draft. Retire it instead.';
      }
      return (await hold()) || { changeReason: reason, changeAppliesFrom: null };
    }

    if (to === 'retired') return (await hold()) || { retiredAt: now, retiredBy: admin.email || null, changeReason: reason, changeAppliesFrom: now };

    if (to === 'active') {
      const problem = commissionProblem(existing);
      if (problem) return problem;

      const extra: Record<string, any> = { activatedAt: now, activatedBy: admin.email || null, changeReason: reason };
      const requested = new Date(existing.effectiveFrom);
      // A rule can never apply to payments taken before it was activated.
      const effectiveFrom = requested.getTime() < now.getTime() ? now : requested;

      const clash = await db.collection('commissionRules').findOne({
        _id: { $ne: existing._id },
        service: existing.service,
        status: 'active',
        effectiveFrom,
      });
      if (clash) return 'Another active rule for this service has the same effective date.';

      const held = await hold();
      if (held) return held;

      if (effectiveFrom !== requested) {
        extra.effectiveFrom = now;
        extra.effectiveFromRequested = requested;
        await logAudit({
          admin,
          action: 'update',
          module: 'finance',
          entityType: 'commission-rules',
          entityId: String(existing._id),
          entityLabel: String(existing.service),
          before: { effectiveFrom: requested },
          after: { effectiveFrom: now },
          reason: `${reason} (the effective date had passed, so the rule takes effect at activation)`,
        });
      }
      extra.changeAppliesFrom = effectiveFrom;
      return extra;
    }

    return hold();
  },
});

/* ------------------------------------------------------------------ */
/* Refund rules                                                        */
/* ------------------------------------------------------------------ */

function refundRuleProblem(doc: Record<string, any>): string | null {
  if (!validService(doc.service)) return 'Choose a service for this rule';
  if (doc.maxHoursBefore != null && Number(doc.maxHoursBefore) < Number(doc.minHoursBefore || 0)) {
    return '"No more than" hours must be the same as or higher than the "at least" hours';
  }
  return null;
}

/**
 * Two active rules of one service that start at the same hours cannot be told
 * apart: neither the calculator nor the customer could say which one applies.
 */
async function sameStartProblem(db: Db, doc: Record<string, any>): Promise<string | null> {
  const twin = await db.collection('refundRules').findOne({
    _id: { $ne: doc._id },
    service: doc.service,
    status: 'active',
    minHoursBefore: Number(doc.minHoursBefore) || 0,
  });
  if (!twin) return null;
  return `The active rule "${twin.name}" for this service also starts at ${Number(doc.minHoursBefore) || 0} hours before the event, so it would be unclear which of the two applies. Change the hours of one of them, or retire the other rule first.`;
}

registerHooks('refund-rules', {
  async beforeCreate(ctx) {
    const { doc } = ctx;
    const reason = typeof doc.changeReason === 'string' ? doc.changeReason.trim() : '';
    if (reason.length < MIN_REASON) return 'A written reason is required to create a refund rule';
    doc.changeReason = reason;
    const problem = refundRuleProblem(doc);
    if (problem) return problem;
    const proposed = withoutServerFields(doc);
    return holdForApproval(ctx, {
      action: 'refund_rules',
      resource: 'refund-rules',
      method: 'POST',
      id: null,
      label: ruleLabel(doc, 'refund'),
      before: null,
      after: proposed,
      payload: { doc: proposed },
      reason,
    });
  },

  async beforeUpdate(ctx) {
    const reason = editReason(ctx);
    if (!reason) return 'A written reason is required to change a refund rule. Write why this change is being made.';
    const merged = { ...ctx.existing, ...ctx.changes };
    const problem = refundRuleProblem(merged);
    if (problem) return problem;
    if (ctx.existing.status === 'active') {
      const twin = await sameStartProblem(ctx.db, merged);
      if (twin) return twin;
    }
    const changed = diff(ctx.existing, merged);
    if (Object.keys(changed.after).length > 0) {
      const held = await holdForApproval(ctx, {
        action: 'refund_rules',
        resource: 'refund-rules',
        method: 'PUT',
        id: String(ctx.existing._id),
        label: ruleLabel(merged, 'refund'),
        before: changed.before,
        after: changed.after,
        payload: { changes: { ...ctx.changes } },
        reason,
      });
      if (held) return held;
    }
    ctx.changes.changeReason = reason;
    // An active refund rule is used by the next cancellation, so its change counts at once.
    ctx.changes.changeAppliesFrom = ctx.existing.status === 'active' ? new Date() : null;
  },

  async beforeDelete(ctx) {
    if (ctx.reason.trim().length < MIN_REASON) return 'A written reason is required to delete a refund rule';
    return holdForApproval(ctx, {
      action: 'refund_rules',
      resource: 'refund-rules',
      method: 'DELETE',
      id: String(ctx.existing._id),
      label: ruleLabel(ctx.existing, 'refund'),
      before: withoutServerFields(ctx.existing),
      after: null,
      payload: { delete: true },
      reason: ctx.reason.trim(),
    });
  },

  async beforeStatusChange(ctx) {
    const { db, existing, from, to, reason } = ctx;
    if (reason.trim().length < MIN_REASON) return 'A written reason is required to change the status of a refund rule';
    if (to === 'active') {
      const problem = refundRuleProblem(existing) || (await sameStartProblem(db, existing));
      if (problem) return problem;
    }
    const held = await holdForApproval(ctx, {
      action: 'refund_rules',
      resource: 'refund-rules',
      method: 'PATCH',
      id: String(existing._id),
      label: ruleLabel(existing, 'refund'),
      before: { status: from },
      after: { status: to },
      payload: { from, to },
      reason: reason.trim(),
    });
    if (held) return held;
    return { changeReason: reason, changeAppliesFrom: to === 'draft' ? null : new Date() };
  },
});

export {};
