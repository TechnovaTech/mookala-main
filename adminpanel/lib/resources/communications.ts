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
    subtitle: 'Wording for SMS, email, WhatsApp and push messages, with approval before bulk use',
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
      { key: 'subject', label: 'Subject or title', type: 'text', help: 'Used for email subjects and push titles. May contain {{variables}}.' },
      { key: 'body', label: 'Message body', type: 'textarea', required: true, help: 'Write values that change as {{name}}, {{title}}, {{message}} and so on.' },
      { key: 'dltTemplateId', label: 'DLT template ID (SMS)', type: 'text', help: 'The template ID registered on the DLT portal. Indian operators reject SMS without one.' },
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
        { value: 'artists', label: 'Artists' },
        { value: 'organisers', label: 'Organisers' },
        { value: 'all', label: 'Everyone' },
      ] },
      { key: 'channels', label: 'Channels', type: 'multiselect', required: true, list: true, options: CHANNEL_OPTIONS },
      { key: 'templateKey', label: 'Template key', type: 'text', required: true, help: 'The key of the approved template used on every chosen channel. The template receives {{title}}, {{message}} and {{name}}.' },
      { key: 'priority', label: 'Priority', type: 'select', required: true, default: 'normal', list: true, filter: true, options: [
        { value: 'normal', label: 'Normal', tone: 'blue' },
        { value: 'emergency', label: 'Emergency', tone: 'red' },
      ] },
      { key: 'emergencyReason', label: 'Reason for emergency', type: 'textarea', help: 'Required when the priority is Emergency. Emergency announcements can only be approved by a Super Admin.' },
      { key: 'scheduledFor', label: 'Scheduled for', type: 'datetime', list: true },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
      { key: 'lastAttemptAt', label: 'Last send attempt', type: 'datetime', readOnly: true },
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
