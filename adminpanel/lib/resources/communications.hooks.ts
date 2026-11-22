/** Server-side rules for message templates and announcements. Server only. */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { can, normaliseRole } from '../permissions';
import { announcementTemplatesProblem, placeholderProblem, resolveAudience, variablesOfTemplate } from '../notifications';

function same(a: any, b: any): boolean {
  const norm = (v: any) => (v === undefined || v === '' ? null : v instanceof Date ? v.getTime() : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Whether an active admin other than `email` may approve communications. */
async function otherApproverExists(db: Db, email: string | undefined): Promise<boolean> {
  const admins = await db
    .collection('admins')
    .find({ status: { $ne: 'disabled' }, email: { $ne: email || '' } }, { projection: { role: 1, extraPermissions: 1 } })
    .toArray();
  return admins.some((a) => can({ role: a.role, perms: Array.isArray(a.extraPermissions) ? a.extraPermissions : [] }, 'communications:approve'));
}

/**
 * The generic rule stops the author approving a record. This also stops the
 * admin who last changed the wording or content approving that change, unless
 * nobody else could approve it.
 */
async function lastEditorProblem(db: Db, existing: any, admin: { email?: string }, field: string, what: string): Promise<string | null> {
  if (!existing[field] || !admin.email || existing[field] !== admin.email) return null;
  if (!(await otherApproverExists(db, admin.email))) return null;
  return `You changed this ${what} last, so a different admin who can approve must approve it.`;
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const TEMPLATE_KEY = /^[a-z0-9_]{2,50}$/;
/** Changing any of these on an approved template means it needs approval again. */
const TEMPLATE_LOCKED_FIELDS = ['key', 'channel', 'language', 'subject', 'body', 'dltTemplateId', 'whatsappTemplateName', 'whatsappLanguage'];

const TEMPLATE_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'retired'],
  pending_approval: ['approved', 'draft', 'retired'],
  approved: ['draft', 'retired'],
  retired: ['draft'],
};

const WHATSAPP_NAME = /^[a-z0-9_]{1,512}$/;
const WHATSAPP_LANGUAGE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const DLT_ID = /^[A-Za-z0-9-]{4,40}$/;

/** Problems with the wording and the provider details that are wrong whatever the status. */
function templateFormatProblem(record: Record<string, any>): string | null {
  for (const [label, value] of [
    ['Subject', record.subject],
    ['Message body', record.body],
  ] as const) {
    const problem = placeholderProblem(String(value || ''));
    if (problem) return `${label}: ${problem}`;
  }
  const waName = String(record.whatsappTemplateName || '').trim();
  if (waName && !WHATSAPP_NAME.test(waName)) {
    return 'WhatsApp template name may only contain lower-case letters, numbers and underscores, as in WhatsApp Manager';
  }
  const waLanguage = String(record.whatsappLanguage || '').trim();
  if (waLanguage && !WHATSAPP_LANGUAGE.test(waLanguage)) return 'WhatsApp language code looks like en, hi or en_US';
  const dlt = String(record.dltTemplateId || '').trim();
  if (dlt && !DLT_ID.test(dlt)) return 'DLT template ID may only contain letters, numbers and hyphens';
  if (record.channel === 'whatsapp' && !waName) {
    return 'A WhatsApp template needs the name of the template approved by Meta ("WhatsApp template name")';
  }
  return null;
}

/** What a template needs before it can be submitted for approval or approved. */
function templateReadinessProblem(record: Record<string, any>): string | null {
  const format = templateFormatProblem(record);
  if (format) return format;
  if (record.channel === 'sms' && !String(record.dltTemplateId || '').trim()) {
    return 'An SMS template needs its DLT template ID before it can be approved';
  }
  if (record.channel === 'email' && !String(record.subject || '').trim()) return 'An email template needs a subject before it can be approved';
  return null;
}

registerHooks('notification-templates', {
  async beforeCreate({ db, doc }) {
    doc.key = String(doc.key || '').trim().toLowerCase();
    if (!TEMPLATE_KEY.test(doc.key)) return 'Key must be 2 to 50 characters: lower-case letters, numbers and underscores only';
    const problem = templateFormatProblem(doc);
    if (problem) return problem;
    const clash = await db
      .collection('notificationTemplates')
      .findOne({ key: doc.key, channel: doc.channel, language: doc.language }, { projection: { _id: 1 } });
    if (clash) return `A ${doc.channel} template with the key "${doc.key}" already exists for this language`;
    doc.variables = variablesOfTemplate(doc);
  },

  async beforeUpdate({ db, existing, changes, admin }) {
    if ('key' in changes) changes.key = String(changes.key || '').trim().toLowerCase();
    const merged = { ...existing, ...changes };
    if (!TEMPLATE_KEY.test(merged.key)) return 'Key must be 2 to 50 characters: lower-case letters, numbers and underscores only';
    const problem = templateFormatProblem(merged);
    if (problem) return problem;

    const touched = TEMPLATE_LOCKED_FIELDS.filter((key) => key in changes && !same(existing[key], changes[key]));
    if (existing.status === 'retired' && touched.length) return 'A retired template cannot be edited. Move it back to Draft first.';

    const clash = await db
      .collection('notificationTemplates')
      .findOne({ key: merged.key, channel: merged.channel, language: merged.language, _id: { $ne: existing._id } }, { projection: { _id: 1 } });
    if (clash) return `A ${merged.channel} template with the key "${merged.key}" already exists for this language`;

    changes.variables = variablesOfTemplate(merged);
    if (touched.length) {
      changes.wordingChangedBy = admin.email || null;
      changes.wordingChangedAt = new Date();
    }

    // Editing approved wording takes the approval away: the template waits for approval again
    // and nothing bulk or emergency can use it until a different admin approves the new text.
    if (existing.status === 'approved' && touched.length) {
      changes.status = 'pending_approval';
      changes.approvedBy = null;
      changes.approvedAt = null;
      changes.reapprovalNote = `Changed (${touched.join(', ')}) by ${admin.email || 'an admin'} on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC after approval by ${existing.approvedBy || 'an approver'}: needs approval again.`;
    }
  },

  async beforeStatusChange({ db, existing, from, to, admin }) {
    if (!(TEMPLATE_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'approved') return 'Only a template that is pending approval can be approved.';
      return `A template cannot move from "${from}" to "${to}".`;
    }
    if (to === 'pending_approval' || to === 'approved') {
      const problem = templateReadinessProblem(existing);
      if (problem) return problem;
    }
    if (to === 'approved') {
      const editor = await lastEditorProblem(db, existing, admin, 'wordingChangedBy', "template's wording");
      if (editor) return editor;
      return { approvedBy: admin.email || null, approvedAt: new Date(), reapprovalNote: null };
    }
    if (to === 'draft') return { approvedBy: null, approvedAt: null };
  },
});

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const ANNOUNCEMENT_LOCKED = ['approved', 'scheduled', 'sending', 'sent', 'failed'];
const ANNOUNCEMENT_CONTENT = [
  'title',
  'message',
  'audience',
  'city',
  'eventFilter',
  'attendedOnly',
  'membershipFilter',
  'channels',
  'templateKey',
  'priority',
  'emergencyReason',
];

const ANNOUNCEMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'draft', 'cancelled'],
  scheduled: ['draft', 'cancelled'],
  // A partly sent announcement can be stopped, not edited.
  sending: ['cancelled'],
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
  if ((String(record.eventFilter || '').trim() || record.membershipFilter) && record.audience !== 'customers') {
    return 'The event and membership filters are for customers only: choose the audience "Customers" or clear them';
  }
  if (record.attendedOnly && !String(record.eventFilter || '').trim()) {
    return '"Only customers who attended" needs an event in "Customers of event"';
  }
  return null;
}

function audienceFilters(record: Record<string, any>) {
  return {
    city: record.city || null,
    event: record.eventFilter || null,
    attendedOnly: record.attendedOnly === true,
    membership: record.membershipFilter || null,
  };
}

registerHooks('announcements', {
  beforeCreate({ doc }) {
    doc.templateKey = String(doc.templateKey || '').trim().toLowerCase();
    doc.city = doc.city ? String(doc.city).trim() : null;
    doc.eventFilter = doc.eventFilter ? String(doc.eventFilter).trim() : null;
    return announcementProblem(doc) || undefined;
  },

  beforeUpdate({ existing, changes, admin }) {
    if (existing.status === 'sent') return 'An announcement that has been sent cannot be edited';
    if ('templateKey' in changes) changes.templateKey = String(changes.templateKey || '').trim().toLowerCase();
    if ('city' in changes) changes.city = changes.city ? String(changes.city).trim() : null;
    if ('eventFilter' in changes) changes.eventFilter = changes.eventFilter ? String(changes.eventFilter).trim() : null;
    const touched = ANNOUNCEMENT_CONTENT.filter((key) => key in changes && !same(existing[key], changes[key]));
    if (ANNOUNCEMENT_LOCKED.includes(existing.status) && touched.length) {
      return existing.status === 'sending'
        ? 'This announcement is being sent, so its content, audience and channels cannot be changed. Cancel it to stop it.'
        : 'This announcement was approved, so its content, audience and channels cannot be changed. Move it back to Draft to edit it; it will then need approval again.';
    }
    if (touched.length) {
      changes.contentChangedBy = admin.email || null;
      changes.contentChangedAt = new Date();
    }
    return announcementProblem({ ...existing, ...changes }) || undefined;
  },

  async beforeStatusChange({ db, existing, from, to, admin }) {
    if (to === 'sent' || to === 'failed' || to === 'sending') {
      return 'This status is set by the send action, not by hand. Use "Send now" on the announcement, or wait for the scheduler.';
    }
    if (!(ANNOUNCEMENT_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'scheduled') return 'Only an approved announcement can be scheduled. Submit it for approval first.';
      if (to === 'approved') return 'Only an announcement that is pending approval can be approved.';
      return `An announcement cannot move from "${from}" to "${to}".`;
    }
    if (to === 'pending_approval' || to === 'approved') {
      const problem = announcementProblem(existing);
      if (problem) return problem;
      const audience = await resolveAudience(db, existing.audience, null, audienceFilters(existing));
      if (typeof audience === 'string') return audience;
    }
    if (to === 'approved') {
      if (existing.priority === 'emergency' && normaliseRole(admin.role) !== 'super_admin') {
        return 'Emergency announcements can only be approved by a Super Admin.';
      }
      const editor = await lastEditorProblem(db, existing, admin, 'contentChangedBy', 'announcement');
      if (editor) return editor;
      const templates = await announcementTemplatesProblem(db, existing);
      if (templates) return templates;
      return { approvedBy: admin.email || null, approvedAt: new Date() };
    }
    if (to === 'scheduled') {
      if (!existing.approvedBy) return 'Only an approved announcement can be scheduled.';
      if (!existing.scheduledFor) return 'Set "Scheduled for" before scheduling the announcement.';
      if (new Date(existing.scheduledFor) <= new Date()) return '"Scheduled for" is in the past. Choose a later time.';
    }
    if (to === 'draft') {
      return {
        approvedBy: null,
        approvedAt: null,
        recipientsProcessed: 0,
        sendCursor: null,
        acceptedCount: 0,
        failedCount: 0,
        notSentCount: 0,
      };
    }
  },
});
