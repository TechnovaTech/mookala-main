import type { FieldDef, ResourceDef } from '../resource-types';

/**
 * Customer support and reputation (requirements section 12).
 * Complaints and support tickets share one collection, split by `kind`.
 */

const PRIORITY = [
  { value: 'low', label: 'Low', tone: 'gray' as const },
  { value: 'normal', label: 'Normal', tone: 'blue' as const },
  { value: 'high', label: 'High', tone: 'amber' as const },
  { value: 'urgent', label: 'Urgent', tone: 'red' as const },
];

const SERVICE = [
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

const TEAM = [
  { value: 'operations', label: 'Operations' },
  { value: 'finance', label: 'Finance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'legal', label: 'Legal' },
];

const caseFields: FieldDef[] = [
  { key: 'subject', label: 'Subject', type: 'text', required: true, list: true, search: true },
  { key: 'customerName', label: 'Customer name', type: 'text', list: true, search: true },
  { key: 'customerPhone', label: 'Customer phone', type: 'phone', required: true, list: true, search: true },
  { key: 'service', label: 'Service', type: 'select', options: SERVICE, required: true, list: true, filter: true },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY, required: true, default: 'normal', list: true, filter: true },
  { key: 'assignedTeam', label: 'Assigned team', type: 'select', options: TEAM, list: true, filter: true },
  { key: 'assignedTo', label: 'Assigned to (admin email)', type: 'email' },
  { key: 'bookingId', label: 'Related booking ID', type: 'text', search: true },
  { key: 'description', label: 'Description', type: 'textarea', required: true },
  { key: 'resolution', label: 'Resolution', type: 'textarea', help: 'What was done to close the case.' },
  { key: 'firstResponseAt', label: 'First response at', type: 'datetime', readOnly: true },
  { key: 'resolvedAt', label: 'Resolved at', type: 'datetime', readOnly: true },
];

const caseStatus = {
  key: 'status',
  initial: 'open',
  options: [
    { value: 'open', label: 'Open', tone: 'blue' as const },
    { value: 'in_progress', label: 'In progress', tone: 'amber' as const },
    { value: 'waiting_customer', label: 'Waiting for customer', tone: 'purple' as const },
    { value: 'escalated', label: 'Escalated', tone: 'red' as const },
    { value: 'resolved', label: 'Resolved', tone: 'green' as const },
    { value: 'closed', label: 'Closed', tone: 'gray' as const },
  ],
  reasonRequired: ['escalated', 'closed'],
};

export const supportResources: ResourceDef[] = [
  {
    name: 'complaints',
    collection: 'supportCases',
    module: 'support',
    title: 'Customer Complaints',
    subtitle: 'Complaints raised by customers, with assignment, priority and resolution tracking',
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
    subtitle: 'Help requests from customers, artists and organisers',
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
    subtitle: 'Customer feedback and ratings, and whether each one is shown publicly',
    singular: 'Feedback',
    labelKey: 'customerName',
    fields: [
      { key: 'customerName', label: 'Customer name', type: 'text', list: true, search: true },
      { key: 'customerPhone', label: 'Customer phone', type: 'phone', search: true },
      { key: 'targetType', label: 'About', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'event', label: 'Event' },
        { value: 'artist', label: 'Artist' },
        { value: 'venue', label: 'Venue' },
        { value: 'course', label: 'Course' },
        { value: 'platform', label: 'Platform' },
      ] },
      { key: 'targetName', label: 'Name of event, artist or venue', type: 'text', list: true, search: true },
      { key: 'rating', label: 'Rating (1 to 5)', type: 'number', required: true, min: 1, max: 5, list: true },
      { key: 'comment', label: 'Comment', type: 'textarea' },
    ],
    status: {
      key: 'status',
      initial: 'pending',
      options: [
        { value: 'pending', label: 'Pending review', tone: 'amber' },
        { value: 'published', label: 'Published', tone: 'green' },
        { value: 'hidden', label: 'Hidden', tone: 'gray' },
      ],
      reasonRequired: ['hidden'],
    },
    emptyHint: 'No feedback has been received yet.',
    sourceNote: 'The mobile apps and website do not collect ratings yet. Entries added here are stored and can be published once the apps show them.',
  },
  {
    name: 'user-reports',
    collection: 'userReports',
    module: 'support',
    title: 'Reported Accounts',
    subtitle: 'Reports against users, artists and organisers, with review and escalation',
    singular: 'Report',
    labelKey: 'reportedName',
    fields: [
      { key: 'reportedName', label: 'Reported account', type: 'text', required: true, list: true, search: true },
      { key: 'reportedPhone', label: 'Reported phone', type: 'phone', list: true, search: true },
      { key: 'reportedType', label: 'Account type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'user', label: 'User' },
        { value: 'artist', label: 'Artist' },
        { value: 'organizer', label: 'Organiser' },
        { value: 'advertiser', label: 'Advertiser' },
      ] },
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
