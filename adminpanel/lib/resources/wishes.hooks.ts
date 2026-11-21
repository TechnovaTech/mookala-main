/** Server-side rules for the wishes and greetings resources. */
import type { Db } from 'mongodb';
import { registerHooks, type ResourceHooks } from '../resource-hooks';
import { toObjectId } from '../http';
import { can } from '../permissions';
import { recordManualPayment, recordManualRefund } from '../recorded-payments';

async function findById(db: Db, collection: string, id: unknown) {
  const oid = toObjectId(id);
  return oid ? db.collection(collection).findOne({ _id: oid }) : null;
}

function differs(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

registerHooks('greeting-categories', {
  async beforeDelete({ db, existing, reason }) {
    const templates = await db.collection('greetingTemplates').countDocuments({ category: String(existing._id) });
    if (templates > 0) {
      return `This category has ${templates} template${templates === 1 ? '' : 's'}, so it cannot be deleted. Mark it "Hidden (off sale)" instead, or move its templates to another category first.`;
    }
    if (!reason) return 'A reason is required to delete a category.';
  },
});

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Which status a template may move to from each status. */
const TEMPLATE_NEXT: Record<string, string[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected', 'draft'],
  rejected: ['draft', 'pending_approval'],
  approved: ['unavailable'],
  unavailable: ['approved', 'draft'],
};

const TEMPLATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  unavailable: 'Unavailable',
};

registerHooks('greeting-templates', {
  async beforeCreate({ db, doc }) {
    if (!(await findById(db, 'greetingCategories', doc.category))) return 'The selected category does not exist.';
  },

  async beforeUpdate({ db, existing, changes, reason }) {
    if ('category' in changes && differs(changes.category, existing.category)) {
      if (!(await findById(db, 'greetingCategories', changes.category))) return 'The selected category does not exist.';
    }
    // An approved template is on sale: every change to it, above all to its
    // price, must say why. The old and new values go to the audit trail.
    if (existing.status === 'approved' && !reason) {
      const changed = Object.keys(changes).filter((key) => differs(changes[key], existing[key]));
      if (changed.includes('price')) {
        return 'This template is approved and on sale. Give a reason for the price change in "Reason for this change".';
      }
      if (changed.length > 0) {
        return 'This template is approved and on sale. Give a reason in "Reason for this change" before changing it.';
      }
    }
  },

  async beforeStatusChange({ db, existing, from, to, admin }) {
    const allowed = TEMPLATE_NEXT[from];
    if (allowed && !allowed.includes(to)) {
      return `A template that is "${TEMPLATE_LABEL[from] || from}" cannot be moved to "${TEMPLATE_LABEL[to] || to}". Allowed next: ${allowed
        .map((value) => `"${TEMPLATE_LABEL[value]}"`)
        .join(', ')}.`;
    }
    const now = new Date();
    if (to === 'pending_approval') return { submittedAt: now, submittedBy: admin.email || null };
    if (to === 'rejected') {
      if (!can(admin, 'wishes:approve')) return 'Rejecting a template needs the "approve" permission for Wishes & greetings.';
      return { rejectedAt: now, rejectedBy: admin.email || null };
    }
    if (to === 'unavailable') return { unavailableAt: now };
    if (to === 'approved') {
      // Putting a template that was approved before back on sale is not a new approval.
      const relisting = from === 'unavailable' && Boolean(existing.approvedAt);
      if (!relisting && !can(admin, 'wishes:approve')) {
        return 'Approving a template needs the "approve" permission for Wishes & greetings.';
      }
      if (!(await findById(db, 'greetingCategories', existing.category))) {
        return 'This template has no category any more. Edit it and choose a category before approving it.';
      }
      const backOnSale = existing.unavailableAt ? { unavailableAt: null } : {};
      if (relisting) return backOnSale;
      return { approvedAt: now, approvedBy: admin.email || null, ...backOnSale };
    }
  },

  async beforeDelete({ db, existing, reason }) {
    const orders = await db.collection('wishOrders').countDocuments({ template: String(existing._id) });
    if (orders > 0) {
      return `This template has ${orders} order${orders === 1 ? '' : 's'}, so it cannot be deleted. Mark it "Unavailable (off sale)" instead.`;
    }
    if (!reason) return 'A reason is required to delete a template.';
  },
});

/* ------------------------------------------------------------------ */
/* Orders (template orders and custom wishes)                          */
/* ------------------------------------------------------------------ */

const ORDER_LABEL: Record<string, string> = {
  created: 'Created',
  paid: 'Paid',
  processing: 'Processing',
  delivered: 'Delivered',
  failed: 'Failed',
  delayed: 'Delayed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/**
 * Which status an order may move to from each status. "Cancelled" (only while
 * no payment is recorded) and "Refunded" (only once one is) are added below.
 */
const ORDER_NEXT: Record<string, string[]> = {
  created: ['paid'],
  paid: ['processing', 'delivered', 'delayed', 'failed', 'disputed'],
  processing: ['delivered', 'delayed', 'failed', 'disputed'],
  delayed: ['processing', 'delivered', 'failed', 'disputed'],
  failed: ['processing', 'disputed'],
  disputed: ['processing', 'delivered'],
  delivered: ['disputed'],
  cancelled: [],
  refunded: [],
};

const PROBLEM = ['failed', 'delayed', 'disputed'];

/** The field that keeps the time of each stage. */
const STAMP: Record<string, string> = {
  paid: 'paidAt',
  processing: 'processingAt',
  delivered: 'deliveredAt',
  failed: 'failedAt',
  delayed: 'delayedAt',
  disputed: 'disputedAt',
  cancelled: 'cancelledAt',
  refunded: 'refundedAt',
};

export function wishOrderKey(id: unknown) {
  return `wish-order:${id}`;
}

/** Template must be approved and its category active for an order to be taken. */
async function templateOnSale(db: Db, templateId: unknown): Promise<{ template: any } | string> {
  const template = await findById(db, 'greetingTemplates', templateId);
  if (!template) return 'The selected template does not exist.';
  if (template.status !== 'approved') {
    return `Only an approved template can be ordered. "${template.title}" is ${(TEMPLATE_LABEL[template.status] || template.status).toLowerCase()}.`;
  }
  const category = await findById(db, 'greetingCategories', template.category);
  if (!category) return `"${template.title}" has no category, so it is not on sale.`;
  if (category.status !== 'active') {
    return `"${template.title}" is in the category "${category.name}", which is hidden (off sale), so it cannot be ordered.`;
  }
  return { template };
}

/**
 * Writes the payment (and, for a custom wish, the commission the rule for
 * "wishes" gives) to the ledger, once, and keeps the entry's reference on the
 * order. A template order is the platform's own sale; a custom wish is owed to
 * the artist who makes it.
 */
export async function recordWishPayment(db: Db, order: any, adminEmail?: string | null) {
  const custom = order.kind === 'custom';
  const payment = await recordManualPayment(db, {
    key: wishOrderKey(order._id),
    service: 'wishes',
    amount: Number(order.amount) || 0,
    payeeType: custom ? 'artist' : 'platform',
    payeeId: custom ? String(order.artistId || '') || null : null,
    payeeName: custom ? order.artistName || null : 'Mookalaa',
    customerPhone: order.customerPhone || null,
    description: custom
      ? `Custom wish by ${order.artistName || 'artist'} for ${order.recipientName || 'recipient'} (${order.customerName || 'customer'})`
      : `Greeting order for ${order.recipientName || 'recipient'} (${order.customerName || 'customer'})`,
    createdBy: adminEmail || null,
  });
  if (payment && order.ledgerReference !== payment.reference) {
    await db.collection('wishOrders').updateOne({ _id: order._id }, { $set: { ledgerReference: payment.reference } });
  }
  return payment;
}

export async function recordWishRefund(db: Db, order: any, adminEmail?: string | null) {
  const refund = await recordManualRefund(
    db,
    wishOrderKey(order._id),
    `Wish order refunded: ${order.recipientName || 'recipient'} (${order.customerName || 'customer'})${
      order.statusReason ? `. Reason: ${order.statusReason}` : ''
    }`,
    adminEmail || null
  );
  if (refund && order.refundReference !== refund.reference) {
    await db.collection('wishOrders').updateOne({ _id: order._id }, { $set: { refundReference: refund.reference } });
  }
  return refund;
}

const orderHooks: ResourceHooks = {
  async beforeStatusChange({ db, existing, from, to, reason }) {
    const paid = Boolean(existing.paidAt);
    const closed = from === 'cancelled' || from === 'refunded';

    if (to === 'cancelled') {
      if (closed) return `This order is already ${ORDER_LABEL[from].toLowerCase()} and cannot be changed.`;
      if (paid) return 'A payment is recorded for this order, so it cannot simply be cancelled. Mark it "Refunded" to record the refund.';
    } else if (to === 'refunded') {
      if (closed) return `This order is already ${ORDER_LABEL[from].toLowerCase()} and cannot be changed.`;
      if (!paid) return 'No payment is recorded for this order, so there is nothing to refund. Mark it "Cancelled" instead.';
    } else {
      const allowed = ORDER_NEXT[from];
      if (allowed && !allowed.includes(to)) {
        if (to === 'delivered' && !paid) {
          return 'This order has never been marked "Paid", so it cannot be marked "Delivered". Record the payment first.';
        }
        const next = [...allowed, ...(closed ? [] : [paid ? 'refunded' : 'cancelled'])];
        return `An order that is "${ORDER_LABEL[from] || from}" cannot be moved to "${ORDER_LABEL[to] || to}". ${
          next.length ? 'Allowed next: ' + next.map((value) => `"${ORDER_LABEL[value]}"`).join(', ') + '.' : 'It is closed.'
        }`;
      }
    }

    if (to === 'delivered' && !paid) {
      return 'This order has never been marked "Paid", so it cannot be marked "Delivered". Record the payment first.';
    }
    // Leaving a problem state is a retry or a resolution and must say what was done.
    if (PROBLEM.includes(from) && !reason) {
      return `This order is "${ORDER_LABEL[from]}". Give a reason that says how it was retried or resolved.`;
    }

    if (to === 'paid') {
      if (!(Number(existing.amount) > 0)) return 'Set the amount the customer is charged before marking the order paid.';
      if (!String(existing.paymentReference || '').trim()) {
        return 'Add the payment reference (bank, UPI or receipt number) to the order before marking it paid.';
      }
      if (existing.kind === 'custom') {
        const artist = await findById(db, 'artists', existing.artistId);
        if (!artist) return 'Assign an approved artist to this custom wish before marking it paid.';
        if (artist.kycStatus !== 'approved') {
          return `${artist.name || 'The assigned artist'} is no longer an approved artist. Assign another artist before marking the wish paid.`;
        }
      }
    }

    const now = new Date();
    const extra: Record<string, any> = {};
    // "Paid" and the first "Processing" keep their first time; the other stages keep the latest.
    if (to === 'paid' || to === 'processing') extra[STAMP[to]] = existing[STAMP[to]] || now;
    else if (STAMP[to]) extra[STAMP[to]] = now;
    if (to === 'processing' && PROBLEM.includes(from)) {
      extra.retryCount = (Number(existing.retryCount) || 0) + 1;
      extra.lastRetryAt = now;
    }
    return extra;
  },

  async afterStatusChange({ db, item, to, admin }) {
    // The status is already saved; a ledger failure is logged and can be
    // repaired from the Wishes Reports screen ("Record missing entries").
    try {
      if (to === 'paid') await recordWishPayment(db, item, admin.email);
      if (to === 'refunded') await recordWishRefund(db, item, admin.email);
    } catch (error) {
      console.error('Ledger entry for wish order failed:', error);
    }
  },

  beforeDelete({ existing, reason }) {
    if (existing.paidAt) {
      return 'A payment is recorded for this order and is in the finance ledger, so the order cannot be deleted. Mark it "Refunded" if the money went back.';
    }
    if (!reason) return 'A reason is required to delete an order.';
  },
};

/** After payment the charged amount is in the ledger and may not drift from it. */
function lockedAfterPayment(existing: any, changes: Record<string, any>): string | void {
  if (!existing.paidAt) return;
  if ('amount' in changes && Number(changes.amount) !== Number(existing.amount)) {
    return 'The amount cannot be changed after the order was marked paid: the payment is already in the finance ledger. Refund this order and create a new one.';
  }
}

registerHooks('wish-orders', {
  ...orderHooks,
  async beforeCreate({ db, doc }) {
    const sale = await templateOnSale(db, doc.template);
    if (typeof sale === 'string') return sale;
    doc.listPrice = Number(sale.template.price) || 0;
    if (doc.amount === null || doc.amount === undefined) doc.amount = doc.listPrice;
  },
  async beforeUpdate({ db, existing, changes }) {
    const locked = lockedAfterPayment(existing, changes);
    if (locked) return locked;
    if ('template' in changes && differs(changes.template, existing.template)) {
      if (existing.paidAt) return 'The template cannot be changed after the order was marked paid.';
      const sale = await templateOnSale(db, changes.template);
      if (typeof sale === 'string') return sale;
      changes.listPrice = Number(sale.template.price) || 0;
    }
    if ('amount' in changes && (changes.amount === null || changes.amount === undefined)) {
      return 'Amount is required.';
    }
  },
});

registerHooks('custom-wishes', {
  ...orderHooks,
  beforeUpdate({ existing, changes }) {
    return lockedAfterPayment(existing, changes);
  },
});
