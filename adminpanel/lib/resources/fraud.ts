import type { ResourceDef } from '../resource-types';

/**
 * Risk cases (requirements section 17): the human review of a risk signal,
 * with evidence notes, escalation and a documented resolution. A case records
 * a review. It does not restrict any account by itself.
 */
export const fraudResources: ResourceDef[] = [
  {
    name: 'risk-cases',
    collection: 'riskCases',
    module: 'fraud',
    title: 'Risk Cases',
    subtitle: 'Reviews of risk signals: evidence notes, escalation and documented resolution',
    singular: 'Risk case',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'type', label: 'Type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'multiple_accounts', label: 'Multiple accounts' },
        { value: 'account_activity', label: 'Account activity' },
        { value: 'seller_risk', label: 'Artist or organiser verification' },
        { value: 'payment_risk', label: 'Payments' },
        { value: 'otp_abuse', label: 'OTP requests' },
        { value: 'refund_patterns', label: 'Cancellations and refunds' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'subjectType', label: 'Subject type', type: 'select', required: true, filter: true, options: [
        { value: 'user', label: 'User' },
        { value: 'artist', label: 'Artist' },
        { value: 'organizer', label: 'Organiser' },
        { value: 'phone', label: 'Phone number' },
        { value: 'ip', label: 'IP address' },
        { value: 'booking', label: 'Booking' },
        { value: 'payment', label: 'Payment' },
        { value: 'payee', label: 'Payee' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'subjectId', label: 'Subject ID', type: 'text', search: true, help: 'The account ID, phone number, payment reference or IP address under review.' },
      { key: 'subjectLabel', label: 'Subject', type: 'text', required: true, list: true, search: true, help: 'Name or description of who or what is under review.' },
      { key: 'severity', label: 'Severity', type: 'select', required: true, default: 'medium', list: true, filter: true, options: [
        { value: 'low', label: 'Low', tone: 'gray' },
        { value: 'medium', label: 'Medium', tone: 'amber' },
        { value: 'high', label: 'High', tone: 'red' },
      ] },
      { key: 'evidenceSummary', label: 'Evidence summary', type: 'textarea', required: true, help: 'The facts that led to this review. Add further findings as internal notes on the case.' },
      { key: 'assignedTo', label: 'Assigned to (admin email)', type: 'email', list: true, search: true },
      { key: 'outcome', label: 'Outcome', type: 'textarea', help: 'What the review found and what, if anything, was done.' },
      { key: 'signalKey', label: 'Source signal', type: 'text', readOnly: true },
      { key: 'escalatedBy', label: 'Escalated by', type: 'text', readOnly: true },
      { key: 'escalatedAt', label: 'Escalated at', type: 'datetime', readOnly: true },
      { key: 'resolvedBy', label: 'Resolved by', type: 'text', readOnly: true },
      { key: 'resolvedAt', label: 'Resolved at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'open',
      options: [
        { value: 'open', label: 'Open', tone: 'blue' },
        { value: 'under_review', label: 'Under review', tone: 'amber' },
        { value: 'escalated', label: 'Escalated', tone: 'red' },
        { value: 'resolved_no_action', label: 'Resolved: no action', tone: 'green' },
        { value: 'resolved_action_taken', label: 'Resolved: action taken', tone: 'purple' },
        { value: 'closed', label: 'Closed', tone: 'gray' },
      ],
      reasonRequired: ['escalated', 'resolved_no_action', 'resolved_action_taken'],
    },
    emptyHint: 'No risk cases have been opened. Open one from a signal on the Risk Overview page, or add one here.',
  },
];
