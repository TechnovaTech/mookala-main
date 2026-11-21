import type { FieldDef, Option, ResourceDef, StatusDef } from '../resource-types';

/**
 * Commission rules and refund rules (requirements sections 10.1, 11 and 20).
 *
 * Both are rule tables with a draft / active / retired life cycle. A rule can
 * be edited or deleted in any status. The server hooks in finance.hooks.ts
 * enforce that every change carries a written reason and record when it
 * starts to apply; payments and refunds already made keep their own copy of
 * the rule that was used.
 *
 * The list below mirrors `SERVICES` in lib/ledger.ts. It is repeated here
 * because this file is bundled for the browser and lib/ledger.ts imports
 * Node's crypto module. The hooks reject any service that is not in `SERVICES`.
 */
export const FINANCE_SERVICES: Option[] = [
  { value: 'ticketing', label: 'Event ticketing' },
  { value: 'artist_booking', label: 'Artist booking' },
  { value: 'learning', label: 'Learning' },
  { value: 'wishes', label: 'Wishes & greetings' },
  { value: 'membership', label: 'Membership' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'premium_search', label: 'Premium search pass' },
];

const ruleStatus: StatusDef = {
  key: 'status',
  initial: 'draft',
  options: [
    { value: 'draft', label: 'Draft', tone: 'gray' },
    { value: 'active', label: 'Active', tone: 'green' },
    { value: 'retired', label: 'Retired', tone: 'amber' },
  ],
  // No silent financial changes: every status change is explained.
  reasonRequired: ['draft', 'active', 'retired'],
};

const changeReason: FieldDef = {
  key: 'changeReason',
  label: 'Reason for this change',
  type: 'textarea',
  required: true,
  help: 'Required. Saved in the activity log with the old and new values.',
};

export const financeResources: ResourceDef[] = [
  {
    name: 'commission-rules',
    collection: 'commissionRules',
    module: 'finance',
    title: 'Commission Rules',
    subtitle: 'Commission, GST and gateway charge rules for each service',
    singular: 'Commission rule',
    labelKey: 'service',
    canDelete: true,
    defaultSort: { key: 'effectiveFrom', dir: -1 },
    fields: [
      { key: 'service', label: 'Service', type: 'select', options: FINANCE_SERVICES, required: true, list: true, filter: true },
      { key: 'ratePercent', label: 'Commission rate (%)', type: 'percent', required: true, list: true },
      { key: 'minFee', label: 'Minimum fee (₹)', type: 'money', list: true, help: 'Charged when the percentage comes to less than this. Leave empty for none.' },
      { key: 'maxFee', label: 'Maximum commission (₹)', type: 'money', list: true, help: 'The commission never exceeds this. Leave empty for no limit.' },
      { key: 'gstPercent', label: 'GST on commission (%)', type: 'percent', list: true },
      { key: 'gatewayFeePercent', label: 'Gateway fee (%)', type: 'percent', list: true, help: 'Share of the payment kept by the payment gateway.' },
      { key: 'effectiveFrom', label: 'Effective from', type: 'datetime', required: true, list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      changeReason,
    ],
    status: ruleStatus,
    emptyHint: 'No commission rule has been created. Until one is active, no commission is deducted.',
  },
  {
    name: 'refund-rules',
    collection: 'refundRules',
    module: 'refunds',
    title: 'Refund Rules',
    subtitle: 'Cancellation windows and refund percentages for each service',
    singular: 'Refund rule',
    labelKey: 'name',
    canDelete: true,
    defaultSort: { key: 'minHoursBefore', dir: -1 },
    fields: [
      { key: 'name', label: 'Rule name', type: 'text', required: true, list: true, search: true, placeholder: 'e.g. More than 72 hours before the event' },
      { key: 'service', label: 'Service', type: 'select', options: FINANCE_SERVICES, required: true, list: true, filter: true },
      { key: 'minHoursBefore', label: 'Cancelled at least (hours before)', type: 'number', required: true, min: 0, list: true, help: 'The rule applies when the customer cancels at least this many hours before the event.' },
      { key: 'maxHoursBefore', label: 'And no more than (hours before)', type: 'number', min: 0, list: true, help: 'Leave empty for no upper limit.' },
      { key: 'refundPercent', label: 'Refund (%)', type: 'percent', required: true, list: true, help: 'Share of the amount paid that is returned.' },
      { key: 'deductionFlat', label: 'Flat cancellation charge (₹)', type: 'money', list: true, help: 'Taken off the refund after the percentage. Leave empty for none.' },
      changeReason,
    ],
    status: ruleStatus,
    emptyHint: 'No refund rule has been created. Until a rule is active, a cancellation gives no automatic refund.',
  },
];
