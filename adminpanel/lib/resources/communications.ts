import type { ResourceDef } from '../resource-types';

/**
 * Communications (requirements sections 13 and 14): message templates and
 * announcements. Channel settings and the delivery log have their own screens.
 *
 * Plain data only: this file is bundled for the browser. The rules are in
 * communications.hooks.ts and the sending code is in lib/notifications.ts.
 */

const CHANNEL_OPTIONS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
];

export const communicationsResources: ResourceDef[] = [
  {
    name: 'notification-templates',
    collection: 'notificationTemplates',
    module: 'communications',
    title: 'Message Templates',
    subtitle: 'Wording for SMS, email, WhatsApp and push messages, with approval before bulk or emergency use',
    singular: 'Template',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Template name', type: 'text', required: true, list: true, search: true },
      { key: 'key', label: 'Key', type: 'text', required: true, list: true, search: true, help: 'Short identifier used when sending, for example event_reminder. Lower-case letters, numbers and underscores.' },
      { key: 'channel', label: 'Channel', type: 'select', required: true, list: true, filter: true, options: CHANNEL_OPTIONS },
      { key: 'language', label: 'Language', type: 'select', required: true, default: 'en', list: true, filter: true, options: [
        { value: 'en', label: 'English' },
        { value: 'hi', label: 'Hindi' },
        { value: 'gu', label: 'Gujarati' },
        { value: 'kn', label: 'Kannada' },
        { value: 'mr', label: 'Marathi' },
        { value: 'ta', label: 'Tamil' },
        { value: 'te', label: 'Telugu' },
      ] },
      { key: 'subject', label: 'Subject or title', type: 'text', help: 'Required for email (the subject). The title of a push notification. May contain {{variables}}.' },
      { key: 'body', label: 'Message body', type: 'textarea', required: true, help: 'Write values that change as {{name}}, {{title}}, {{message}} and so on. For WhatsApp, the variables are sent in the order they first appear, as {{1}}, {{2}}, ... of the template approved by Meta.' },
      { key: 'dltTemplateId', label: 'DLT template ID (SMS)', type: 'text', help: 'Required for SMS templates before approval: the template ID registered on the DLT portal. Indian operators reject SMS without one.' },
      { key: 'whatsappTemplateName', label: 'WhatsApp template name', type: 'text', help: 'Required for WhatsApp: the name of the template as approved by Meta in WhatsApp Manager (lower-case letters, numbers and underscores).' },
      { key: 'whatsappLanguage', label: 'WhatsApp language code', type: 'text', placeholder: 'en_US', help: 'The language code of the template in WhatsApp Manager, for example en_US or hi. Leave empty to use the language above.' },
      { key: 'variables', label: 'Variables used', type: 'tags', readOnly: true, list: true, help: 'Worked out from the subject and body when the template is saved. A message is only sent when every one of them has a value.' },
      { key: 'reapprovalNote', label: 'Re-approval', type: 'text', readOnly: true },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'pending_approval', label: 'Pending approval', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'green' },
        { value: 'retired', label: 'Retired', tone: 'red' },
      ],
      approvalRequired: ['approved'],
    },
    emptyHint: 'No message templates have been written yet.',
  },
  {
    name: 'announcements',
    collection: 'announcements',
    module: 'communications',
    title: 'Announcements',
    subtitle: 'Messages to customers, artists and organisers, with approval, scheduling and per-recipient results',
    singular: 'Announcement',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'message', label: 'Message', type: 'textarea', required: true, search: true },
      { key: 'audience', label: 'Audience', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'customers', label: 'Customers' },
        { value: 'artists', label: 'Artists (admin-to-artist)' },
        { value: 'organisers', label: 'Organisers' },
        { value: 'all', label: 'Everyone' },
      ] },
      { key: 'city', label: 'Only in city', type: 'text', list: true, help: 'Optional. Exact city name, any letter case, for example Rajkot.' },
      { key: 'eventFilter', label: 'Customers of event', type: 'text', help: 'Optional, customers only: the event ID or the exact event name. Leave empty for all customers.' },
      { key: 'attendedOnly', label: 'Only customers who attended (checked in)', type: 'boolean', help: 'With an event: only customers who were checked in, not everyone who booked.' },
      { key: 'membershipFilter', label: 'Membership', type: 'select', help: 'Optional, customers only.', options: [
        { value: 'active', label: 'Active members' },
        { value: 'expired', label: 'Membership ended' },
        { value: 'none', label: 'Never a member' },
      ] },
      { key: 'channels', label: 'Channels', type: 'multiselect', required: true, list: true, options: CHANNEL_OPTIONS },
      { key: 'templateKey', label: 'Template key', type: 'text', required: true, help: 'The key of the approved template used on every chosen channel. The template may use {{title}}, {{message}}, {{name}} and {{city}}.' },
      { key: 'priority', label: 'Priority', type: 'select', required: true, default: 'normal', list: true, filter: true, options: [
        { value: 'normal', label: 'Normal', tone: 'blue' },
        { value: 'emergency', label: 'Emergency', tone: 'red' },
      ] },
      { key: 'emergencyReason', label: 'Reason for emergency', type: 'textarea', help: 'Required when the priority is Emergency. Emergency announcements can only be approved by a Super Admin, and "Send now" sends them at once even if a time is scheduled.' },
      { key: 'scheduledFor', label: 'Scheduled for', type: 'datetime', list: true, help: 'For a scheduled announcement: approve it, then move it to Scheduled. The scheduler sends it within 15 minutes of this time.' },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
      { key: 'lastAttemptAt', label: 'Last send attempt', type: 'datetime', readOnly: true },
      { key: 'lastRunBy', label: 'Last run by', type: 'text', readOnly: true },
      { key: 'audienceCount', label: 'Recipients matched', type: 'number', readOnly: true },
      { key: 'recipientsProcessed', label: 'Recipients processed', type: 'number', readOnly: true },
      { key: 'acceptedCount', label: 'Messages accepted by a provider', type: 'number', readOnly: true },
      { key: 'failedCount', label: 'Messages refused by a provider', type: 'number', readOnly: true },
      { key: 'notSentCount', label: 'Messages not sent', type: 'number', readOnly: true },
      { key: 'failureReason', label: 'Result of last attempt', type: 'text', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'pending_approval', label: 'Pending approval', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'blue' },
        { value: 'scheduled', label: 'Scheduled', tone: 'purple' },
        { value: 'sending', label: 'Sending', tone: 'blue' },
        { value: 'sent', label: 'Sent', tone: 'green' },
        { value: 'failed', label: 'Failed', tone: 'red' },
        { value: 'cancelled', label: 'Cancelled', tone: 'gray' },
      ],
      approvalRequired: ['approved'],
      reasonRequired: ['cancelled'],
    },
    emptyHint: 'No announcements have been written yet.',
  },
];
