/** Server-side rules for message templates and announcements. Server only. */
import { registerHooks } from '../resource-hooks';
import { normaliseRole } from '../permissions';

function same(a: any, b: any): boolean {
  const norm = (v: any) => (v === undefined || v === '' ? null : v instanceof Date ? v.getTime() : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const TEMPLATE_KEY = /^[a-z0-9_]{2,50}$/;
const TEMPLATE_LOCKED_FIELDS = ['key', 'channel', 'language', 'subject', 'body', 'dltTemplateId'];

const TEMPLATE_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'retired'],
  pending_approval: ['approved', 'draft', 'retired'],
  approved: ['draft', 'retired'],
  retired: ['draft'],
};

registerHooks('notification-templates', {
  async beforeCreate({ db, doc }) {
    doc.key = String(doc.key || '').trim().toLowerCase();
    if (!TEMPLATE_KEY.test(doc.key)) return 'Key must be 2 to 50 characters: lower-case letters, numbers and underscores only';
    const clash = await db
      .collection('notificationTemplates')
      .findOne({ key: doc.key, channel: doc.channel, language: doc.language }, { projection: { _id: 1 } });
    if (clash) return `A ${doc.channel} template with the key "${doc.key}" already exists for this language`;
  },

  async beforeUpdate({ db, existing, changes }) {
    if ('key' in changes) changes.key = String(changes.key || '').trim().toLowerCase();
    const merged = { ...existing, ...changes };
    if (!TEMPLATE_KEY.test(merged.key)) return 'Key must be 2 to 50 characters: lower-case letters, numbers and underscores only';

    if (existing.status === 'approved' || existing.status === 'retired') {
      const touched = TEMPLATE_LOCKED_FIELDS.filter((key) => key in changes && !same(existing[key], changes[key]));
      if (touched.length) {
        return existing.status === 'approved'
          ? 'This template is approved, so its wording cannot be changed. Move it back to Draft to edit it; it will then need approval again.'
          : 'A retired template cannot be edited. Move it back to Draft first.';
      }
    }

    const clash = await db
      .collection('notificationTemplates')
      .findOne({ key: merged.key, channel: merged.channel, language: merged.language, _id: { $ne: existing._id } }, { projection: { _id: 1 } });
    if (clash) return `A ${merged.channel} template with the key "${merged.key}" already exists for this language`;
  },

  beforeStatusChange({ from, to, admin }) {
    if (!(TEMPLATE_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'approved') return 'Only a template that is pending approval can be approved.';
      return `A template cannot move from "${from}" to "${to}".`;
    }
    if (to === 'approved') return { approvedBy: admin.email || null, approvedAt: new Date() };
    if (to === 'draft') return { approvedBy: null, approvedAt: null };
  },
});

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const ANNOUNCEMENT_LOCKED = ['approved', 'scheduled', 'sent', 'failed'];
const ANNOUNCEMENT_CONTENT = ['title', 'message', 'audience', 'channels', 'templateKey', 'priority', 'emergencyReason'];

const ANNOUNCEMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'draft', 'cancelled'],
  scheduled: ['draft', 'cancelled'],
  failed: ['draft', 'cancelled'],
  cancelled: ['draft'],
  sent: [],
};

function announcementProblem(record: Record<string, any>): string | null {
  if (record.priority === 'emergency' && !String(record.emergencyReason || '').trim()) {
    return 'An emergency announcement needs a written reason in "Reason for emergency"';
  }
  if (!/^[a-z0-9_]{2,50}$/.test(String(record.templateKey || ''))) {
    return 'Template key must be the key of a message template, for example general_announcement';
  }
  return null;
}

registerHooks('announcements', {
  beforeCreate({ doc }) {
    doc.templateKey = String(doc.templateKey || '').trim().toLowerCase();
    return announcementProblem(doc) || undefined;
  },

  beforeUpdate({ existing, changes }) {
    if (existing.status === 'sent') return 'An announcement that has been sent cannot be edited';
    if ('templateKey' in changes) changes.templateKey = String(changes.templateKey || '').trim().toLowerCase();
    if (ANNOUNCEMENT_LOCKED.includes(existing.status)) {
      const touched = ANNOUNCEMENT_CONTENT.filter((key) => key in changes && !same(existing[key], changes[key]));
      if (touched.length) {
        return 'This announcement was approved, so its content, audience and channels cannot be changed. Move it back to Draft to edit it; it will then need approval again.';
      }
    }
    return announcementProblem({ ...existing, ...changes }) || undefined;
  },

  beforeStatusChange({ existing, from, to, admin }) {
    if (to === 'sent' || to === 'failed') {
      return 'This status is set by the send action, not by hand. Use "Send now" on the announcement.';
    }
    if (!(ANNOUNCEMENT_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'scheduled') return 'Only an approved announcement can be scheduled. Submit it for approval first.';
      if (to === 'approved') return 'Only an announcement that is pending approval can be approved.';
      return `An announcement cannot move from "${from}" to "${to}".`;
    }
    if (to === 'pending_approval') return announcementProblem(existing) || undefined;
    if (to === 'approved') {
      if (existing.priority === 'emergency' && normaliseRole(admin.role) !== 'super_admin') {
        return 'Emergency announcements can only be approved by a Super Admin.';
      }
      return { approvedBy: admin.email || null, approvedAt: new Date() };
    }
    if (to === 'scheduled') {
      if (!existing.approvedBy) return 'Only an approved announcement can be scheduled.';
      if (!existing.scheduledFor) return 'Set "Scheduled for" before scheduling the announcement.';
      if (new Date(existing.scheduledFor) <= new Date()) return '"Scheduled for" is in the past. Choose a later time.';
    }
    if (to === 'draft') return { approvedBy: null, approvedAt: null, recipientsProcessed: 0 };
  },
});
