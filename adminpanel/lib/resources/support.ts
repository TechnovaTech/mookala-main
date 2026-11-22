import type { FieldDef, Option, ResourceDef } from '../resource-types';

/**
 * Customer support and reputation (requirements section 12).
 *
 * Complaints and support tickets share one collection (`supportCases`), split
 * by `kind`. Their screens are custom (components/support/CasesWorkspace.tsx)
 * because a case is a workflow: assignment to an authorised team, escalation,
 * replies to the customer, internal notes and SLA times computed on read.
 * The definitions below still drive the generic API (create, edit, status
 * changes with their hooks in support.hooks.ts, CSV export).
 *
 * Fields set only by the support workflow are `readOnly`, so the generic
 * form cannot write them: assignment goes through
 * POST /api/admin/support/cases/[id] { action: 'assign' }, which checks that
 * the admin belongs to the team.
 *
 * Plain data only: this file is also bundled for the browser.
 */

export const CASE_PRIORITIES: Option[] = [
  { value: 'low', label: 'Low', tone: 'gray' },
  { value: 'normal', label: 'Normal', tone: 'blue' },
  { value: 'high', label: 'High', tone: 'amber' },
  { value: 'urgent', label: 'Urgent', tone: 'red' },
];

/** Lowest to highest. Escalation moves a case one step up this list. */
export const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];

export const CASE_SERVICES: Option[] = [
  { value: 'ticketing', label: 'Event ticketing' },
  { value: 'artist_booking', label: 'Artist booking' },
  { value: 'learning', label: 'Learning' },
  { value: 'wishes', label: 'Wishes & greetings' },
  { value: 'membership', label: 'Membership' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'payment', label: 'Payment or refund' },
  { value: 'account', label: 'Account' },
  { value: 'other', label: 'Other' },
];

/** A team is the admin role of the same name. Super Admins may be assigned a case of any team. */
export const CASE_TEAMS: Option[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'legal', label: 'Legal' },
];

export const CASE_STATUSES: Option[] = [
  { value: 'open', label: 'Open', tone: 'blue' },
  { value: 'in_progress', label: 'In progress', tone: 'amber' },
  { value: 'waiting_customer', label: 'Waiting for customer', tone: 'purple' },
  { value: 'escalated', label: 'Escalated', tone: 'red' },
  { value: 'resolved', label: 'Resolved', tone: 'green' },
  { value: 'closed', label: 'Closed', tone: 'gray' },
];

/** Statuses in which a case still needs work. */
export const OPEN_CASE_STATUSES = ['open', 'in_progress', 'waiting_customer', 'escalated'];
/** Statuses that end a case. Moving out of one of them reopens the case. */
export const DONE_CASE_STATUSES = ['resolved', 'closed'];

export const CASE_SOURCES: Option[] = [
  { value: 'admin', label: 'Recorded by staff', tone: 'gray' },
  { value: 'app', label: 'Raised in the app', tone: 'blue' },
];

/**
 * Channels a reply to the customer can go through. Every reply is shown to the
 * customer in the app (Help and support → My tickets); the other channels also
 * hand it to the provider through lib/notifications.ts.
 */
export const REPLY_CHANNELS: Option[] = [
  { value: 'app', label: 'In the app only' },
  { value: 'sms', label: 'SMS (and in the app)' },
  { value: 'email', label: 'Email (and in the app)' },
  { value: 'whatsapp', label: 'WhatsApp (and in the app)' },
];

/** Template key used for replies sent through a channel. Created under Communications → Templates. */
export const SUPPORT_REPLY_TEMPLATE = 'support_reply';

export const DELIVERY_STATES: Option[] = [
  { value: 'in_app', label: 'Shown in the app', tone: 'blue' },
  { value: 'accepted', label: 'Accepted by the provider', tone: 'green' },
  { value: 'failed', label: 'Provider refused it', tone: 'red' },
  { value: 'not_sent', label: 'Not sent', tone: 'amber' },
];

export const SLA_STATES: Option[] = [
  { value: 'met', label: 'Met', tone: 'green' },
  { value: 'within', label: 'Within target', tone: 'blue' },
  { value: 'breached', label: 'Past target', tone: 'red' },
  { value: 'no_target', label: 'No target set', tone: 'gray' },
  { value: 'not_recorded', label: 'Not recorded', tone: 'gray' },
];

/** The resource name of a case kind, which is also its `entityType` in the audit log. */
export function caseResourceName(kind: string): 'complaints' | 'support-tickets' {
  return kind === 'complaint' ? 'complaints' : 'support-tickets';
}

/** The screen of a case kind. */
export function casePath(kind: string): string {
  return kind === 'complaint' ? '/support/complaints' : '/support/tickets';
}

const caseFields: FieldDef[] = [
  { key: 'subject', label: 'Subject', type: 'text', required: true, list: true, search: true },
  { key: 'customerName', label: 'Customer name', type: 'text', list: true, search: true },
  { key: 'customerPhone', label: 'Customer phone', type: 'phone', required: true, list: true, search: true },
  { key: 'service', label: 'Service', type: 'select', options: CASE_SERVICES, required: true, list: true, filter: true },
  { key: 'priority', label: 'Priority', type: 'select', options: CASE_PRIORITIES, required: true, default: 'normal', list: true, filter: true },
  { key: 'bookingId', label: 'Related booking ID', type: 'text', search: true },
  {
    key: 'aboutRefund',
    label: 'About a refund',
    type: 'boolean',
    filter: true,
    help: 'A case about a refund must be linked to it: give the refund ID, or a booking ID that has a refund.',
  },
  { key: 'refundId', label: 'Related refund ID', type: 'text', search: true, help: 'Filled in automatically when the booking has a refund.' },
  { key: 'description', label: 'Description', type: 'textarea', required: true },
  { key: 'resolution', label: 'Resolution', type: 'textarea', help: 'What was done to close the case.' },
  // Set by the support workflow only.
  { key: 'source', label: 'Source', type: 'select', options: CASE_SOURCES, readOnly: true, filter: true },
  { key: 'assignedTeam', label: 'Assigned team', type: 'select', options: CASE_TEAMS, readOnly: true, list: true, filter: true },
  { key: 'assignedToName', label: 'Assigned to', type: 'text', readOnly: true, list: true },
  { key: 'assignedTo', label: 'Assigned to (admin email)', type: 'email', readOnly: true },
  { key: 'escalated', label: 'Escalated', type: 'boolean', readOnly: true, list: true, filter: true },
  { key: 'escalationLevel', label: 'Times escalated', type: 'number', readOnly: true },
  { key: 'firstResponseAt', label: 'First response at', type: 'datetime', readOnly: true },
  { key: 'responseMinutes', label: 'Minutes to first response', type: 'number', readOnly: true },
  { key: 'resolvedAt', label: 'Resolved at', type: 'datetime', readOnly: true },
  { key: 'resolutionMinutes', label: 'Minutes to resolution', type: 'number', readOnly: true },
];

const caseStatus = {
  key: 'status',
  initial: 'open',
  options: CASE_STATUSES,
  reasonRequired: ['escalated', 'closed'],
};

export const FEEDBACK_TARGETS: Option[] = [
  { value: 'event', label: 'Event' },
  { value: 'artist', label: 'Artist' },
  { value: 'organizer', label: 'Organiser' },
  { value: 'venue', label: 'Venue' },
  { value: 'course', label: 'Course' },
  { value: 'platform', label: 'Platform' },
];

export const FEEDBACK_STATUSES: Option[] = [
  { value: 'pending', label: 'Pending review', tone: 'amber' },
  { value: 'published', label: 'Published', tone: 'green' },
  { value: 'hidden', label: 'Hidden', tone: 'gray' },
];

export const REPORT_TYPES: Option[] = [
  { value: 'user', label: 'User' },
  { value: 'artist', label: 'Artist' },
  { value: 'organizer', label: 'Organiser' },
  { value: 'advertiser', label: 'Advertiser' },
];

export const supportResources: ResourceDef[] = [
  {
    name: 'complaints',
    collection: 'supportCases',
    module: 'support',
    title: 'Customer Complaints',
    subtitle: 'Complaints raised by customers, with team assignment, escalation, SLA and resolution tracking',
    singular: 'Complaint',
    labelKey: 'subject',
    scope: { kind: 'complaint' },
    fields: caseFields,
    status: caseStatus,
    emptyHint: 'No complaints have been recorded yet.',
  },
  {
    name: 'support-tickets',
    collection: 'supportCases',
    module: 'support',
    title: 'Support Tickets',
    subtitle: 'Help requests from customers (raised in the app or recorded by staff), with assignment and SLA tracking',
    singular: 'Ticket',
    labelKey: 'subject',
    scope: { kind: 'ticket' },
    fields: caseFields,
    status: caseStatus,
    emptyHint: 'No support tickets have been raised yet.',
  },
  {
    name: 'feedback',
    collection: 'feedback',
    module: 'support',
    title: 'Feedback & Ratings',
    subtitle: 'Ratings from customers who attended an event, moderated before they are shown publicly',
    singular: 'Feedback',
    labelKey: 'customerName',
    // Ratings come only from customers who attended (the app). Staff moderate
    // them; they do not write or change a customer's rating.
    canCreate: false,
    canEdit: false,
    fields: [
      { key: 'customerName', label: 'Customer name', type: 'text', list: true, search: true },
      { key: 'customerPhone', label: 'Customer phone', type: 'phone', search: true },
      { key: 'targetType', label: 'About', type: 'select', required: true, list: true, filter: true, options: FEEDBACK_TARGETS },
      { key: 'targetName', label: 'Name of event, artist or venue', type: 'text', list: true, search: true },
      { key: 'rating', label: 'Rating (1 to 5)', type: 'number', required: true, min: 1, max: 5, list: true },
      { key: 'comment', label: 'Comment', type: 'textarea' },
      { key: 'source', label: 'Source', type: 'select', readOnly: true, filter: true, options: [
        { value: 'app', label: 'Customer app' },
        { value: 'admin', label: 'Recorded by staff' },
      ] },
      { key: 'targetId', label: 'Event, artist or organiser ID', type: 'text', readOnly: true, search: true },
      { key: 'bookingId', label: 'Booking rated', type: 'text', readOnly: true, search: true },
      { key: 'organizerId', label: 'Organiser ID', type: 'text', readOnly: true },
      { key: 'moderatedBy', label: 'Moderated by', type: 'text', readOnly: true },
      { key: 'moderatedAt', label: 'Moderated at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'pending',
      options: FEEDBACK_STATUSES,
      // Publishing and hiding are moderation decisions and always need a reason.
      reasonRequired: ['published', 'hidden'],
    },
    emptyHint: 'No feedback has been received yet.',
    sourceNote:
      'Customers rate an event from My bookings in the app once they have attended it (POST /api/public/feedback). Each rating waits here as "Pending review" and is shown publicly, and counted in the averages on the event, artist and organiser pages, only after it is published.',
  },
  {
    name: 'user-reports',
    collection: 'userReports',
    module: 'support',
    title: 'Reported Accounts',
    subtitle: 'Reports against users, artists and organisers, with review, escalation and account restriction',
    singular: 'Report',
    labelKey: 'reportedName',
    fields: [
      { key: 'reportedName', label: 'Reported account', type: 'text', required: true, list: true, search: true },
      { key: 'reportedPhone', label: 'Reported phone', type: 'phone', list: true, search: true },
      { key: 'reportedType', label: 'Account type', type: 'select', required: true, list: true, filter: true, options: REPORT_TYPES },
      { key: 'reason', label: 'Reason', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'fraud', label: 'Fraud or scam' },
        { value: 'fake_profile', label: 'Fake profile' },
        { value: 'abuse', label: 'Abusive behaviour' },
        { value: 'no_show', label: 'Did not show up' },
        { value: 'payment', label: 'Payment issue' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'reporterPhone', label: 'Reported by (phone)', type: 'phone', search: true },
      { key: 'details', label: 'Details', type: 'textarea', required: true },
      { key: 'actionTaken', label: 'Action taken', type: 'textarea' },
      { key: 'accountActionState', label: 'Account restricted from this report', type: 'select', readOnly: true, list: true, options: [
        { value: 'restricted', label: 'Restricted', tone: 'red' },
        { value: 'lifted', label: 'Restriction lifted', tone: 'green' },
      ] },
    ],
    status: {
      key: 'status',
      initial: 'open',
      options: [
        { value: 'open', label: 'Open', tone: 'blue' },
        { value: 'under_review', label: 'Under review', tone: 'amber' },
        { value: 'escalated', label: 'Escalated', tone: 'red' },
        { value: 'action_taken', label: 'Action taken', tone: 'green' },
        { value: 'dismissed', label: 'Dismissed', tone: 'gray' },
      ],
      reasonRequired: ['action_taken', 'dismissed', 'escalated'],
    },
    emptyHint: 'No accounts have been reported.',
  },
];
