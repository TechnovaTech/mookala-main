/** Server-side hooks for the fraud resources. */
import { registerHooks } from '../resource-hooks';

const RESOLVED = ['resolved_no_action', 'resolved_action_taken'];
const ACTIVE = ['open', 'under_review', 'escalated'];

registerHooks('risk-cases', {
  beforeStatusChange({ from, to, admin, reason }) {
    // Resolving a case records who resolved it, when, and the reason they gave.
    if (RESOLVED.includes(to)) {
      return { resolvedBy: admin.email || null, resolvedAt: new Date(), resolutionReason: reason || null };
    }
    if (to === 'escalated') {
      return { escalatedBy: admin.email || null, escalatedAt: new Date() };
    }
    // A resolved or closed case that is reopened is no longer resolved.
    if (ACTIVE.includes(to) && (RESOLVED.includes(from) || from === 'closed')) {
      return { resolvedBy: null, resolvedAt: null, resolutionReason: null };
    }
  },
});

export {};
