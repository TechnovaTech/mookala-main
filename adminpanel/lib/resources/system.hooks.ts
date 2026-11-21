/** Server-side hooks for the system resources. */
import { registerHooks } from '../resource-hooks';
import { normaliseRole } from '../permissions';

registerHooks('incidents', {
  beforeStatusChange({ existing, from, to, admin }) {
    if (to === 'resolved') {
      return {
        resolvedBy: admin.email || null,
        // Keep the time the team entered, when they entered one.
        ...(existing.resolvedAt ? {} : { resolvedAt: new Date() }),
      };
    }
    if (from === 'resolved') return { resolvedBy: null, resolvedAt: null };
  },
});

const SUPER_ONLY = 'Only a Super Admin can change the backup log.';

function restoreTestProblem(doc: Record<string, any>): string | void {
  if (doc.restoreTested && !doc.restoreTestedAt) return 'Enter the date of the restore test.';
  if (doc.restoreTestedAt && new Date(doc.restoreTestedAt).getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return 'The restore test date cannot be in the future.';
  }
  if (doc.takenAt && new Date(doc.takenAt).getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return 'A backup cannot be recorded with a future date.';
  }
}

// Backup and restore information is restricted to Super Admins.
registerHooks('backups', {
  beforeCreate({ doc, admin }) {
    if (normaliseRole(admin.role) !== 'super_admin') return SUPER_ONLY;
    return restoreTestProblem(doc);
  },
  beforeUpdate({ existing, changes, admin }) {
    if (normaliseRole(admin.role) !== 'super_admin') return SUPER_ONLY;
    return restoreTestProblem({ ...existing, ...changes });
  },
  beforeStatusChange({ admin }) {
    if (normaliseRole(admin.role) !== 'super_admin') return SUPER_ONLY;
  },
});

export {};
