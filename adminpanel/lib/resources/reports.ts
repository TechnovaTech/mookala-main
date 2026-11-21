import type { ResourceDef } from '../resource-types';

/**
 * Reports & Exports (requirements sections 10.3 and 22).
 *
 * This file is plain data shared by the browser and the server: the catalogue
 * of reports, the wording of the figure definitions that is printed on every
 * finance screen and at the top of every exported file, and the
 * `scheduled-reports` resource.
 */

export const REPORT_TIMEZONE = 'Asia/Kolkata';
export const REPORT_TIMEZONE_LABEL = 'Asia/Kolkata (IST, UTC+05:30)';

/** Printed on the screens and written into the header of every export. */
export const FIGURE_DEFINITIONS: { term: string; meaning: string }[] = [
  { term: 'Date range', meaning: 'Whole days in Asia/Kolkata (IST, UTC+05:30), by the time the ledger entry was written.' },
  { term: 'Gross transaction value (GTV)', meaning: "Sum of ledger 'payment' entries with status 'success'." },
  {
    term: 'Platform revenue',
    meaning: "Commission plus refund deductions, status 'success'. GST collected and gateway fees are shown separately and are never part of revenue.",
  },
  {
    term: 'GST collected',
    meaning: "Sum of ledger 'gst' entries with status 'success': GST charged on commission, and GST collected on sales the platform makes itself (for example advertiser invoices).",
  },
  { term: 'Gateway fees', meaning: "Sum of ledger 'gateway_fee' entries with status 'success'." },
  { term: 'Refunds', meaning: "Sum of ledger 'refund' entries with status 'success' (money returned to customers)." },
  {
    term: 'Net to payees',
    meaning: "Payments minus commission, GST, gateway fees and refunds, all with status 'success'.",
  },
  {
    term: 'Pending settlements',
    meaning:
      "Payee balances: for each payee, earned (net to payee) minus settlements paid, over all dates. Shown separately: the total of settlement records whose status is not 'paid'.",
  },
  { term: 'Membership / advertisement revenue', meaning: "Ledger 'payment' entries with status 'success' for the service 'membership' / 'advertising'." },
  {
    term: 'Payment statuses',
    meaning:
      "success = verified with the gateway, or recorded by an admin for a service that is not sold through the gateway (marked 'recorded by admin' in the ledger); failed = the gateway reported a failure; pending = awaiting gateway confirmation; refunded = returned to the customer (on commission, GST and gateway fee entries: the charge was returned with a refunded payment and no longer counts); disputed = flagged by finance or the gateway and excluded from GTV until cleared.",
  },
];

export type ReportGroup = 'Financial' | 'Revenue by service' | 'Bookings & customers' | 'Settlements & refunds';

export interface ReportInfo {
  key: string;
  label: string;
  group: ReportGroup;
  description: string;
  /** Every permission listed is required. */
  permissions: string[];
  /** False when the report is a position "as at now" and ignores the date range. */
  usesDateRange: boolean;
  /** Which records and statuses the report counts. Shown on screen and written into every export. */
  counts: string;
}

const FIN = ['reports:view', 'finance:view'];

export const REPORT_CATALOG: ReportInfo[] = [
  {
    key: 'daily_statement',
    label: 'Daily financial statement',
    group: 'Financial',
    description: 'One row per day: payments, GTV, commission, GST, gateway fees, refunds, deductions, settlements paid and platform revenue.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger entries with status 'success' only, grouped by the day (Asia/Kolkata) on which the entry was written. Entries with status failed, pending, disputed or refunded are not counted.",
  },
  {
    key: 'revenue_daily',
    label: 'Revenue by day',
    group: 'Financial',
    description: 'GTV and platform revenue for each day.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger entries with status 'success' only, grouped by day (Asia/Kolkata). Successful payments only; failed, pending, disputed and refunded entries are not counted.",
  },
  {
    key: 'revenue_monthly',
    label: 'Revenue by month',
    group: 'Financial',
    description: 'GTV and platform revenue for each calendar month.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger entries with status 'success' only, grouped by calendar month (Asia/Kolkata). Successful payments only; failed, pending, disputed and refunded entries are not counted.",
  },
  {
    key: 'revenue_yearly',
    label: 'Revenue by year',
    group: 'Financial',
    description: 'GTV and platform revenue for each calendar year.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger entries with status 'success' only, grouped by calendar year (Asia/Kolkata). Successful payments only; failed, pending, disputed and refunded entries are not counted.",
  },
  {
    key: 'gst',
    label: 'GST report',
    group: 'Financial',
    description: 'One row per commission entry: taxable value (the commission), GST rate and GST amount, with payee and booking reference.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger 'commission' and 'gst' entries with status 'success' only. Charges returned with a refunded payment carry status 'refunded' and are not counted.",
  },
  {
    key: 'service_profitability',
    label: 'Service-wise profitability',
    group: 'Revenue by service',
    description: 'GTV, commission, refund deductions, refunds, net to payees and platform revenue for each service.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger entries with status 'success' only, grouped by service. Platform earnings: for services the platform sells itself (membership, advertising, premium search pass) successful payments less refunds; for every other service commission plus refund deductions.",
  },
  {
    key: 'commission_revenue',
    label: 'Commission revenue',
    group: 'Revenue by service',
    description: 'Commission entries per day and service.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger 'commission' entries with status 'success' only. Commission returned with a refunded payment (status 'refunded') is not counted.",
  },
  {
    key: 'membership_revenue',
    label: 'Membership revenue',
    group: 'Revenue by service',
    description: 'Successful membership payments per day.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger 'payment' entries for the service 'membership' with status 'success' (successful payments only). Failed payments are counted in their own column and never added to revenue. Refunds are 'refund' entries with status 'success' (refunds processed).",
  },
  {
    key: 'advertising_revenue',
    label: 'Advertisement revenue',
    group: 'Revenue by service',
    description: 'Successful advertising payments per day.',
    permissions: FIN,
    usesDateRange: true,
    counts:
      "Ledger 'payment' entries for the service 'advertising' with status 'success' (successful payments only). Failed payments are counted in their own column and never added to revenue. Refunds are 'refund' entries with status 'success' (refunds processed).",
  },
  {
    key: 'bookings',
    label: 'Bookings report',
    group: 'Bookings & customers',
    description: 'Bookings, seats, value, cancellations and check-ins by event, venue, city and event date.',
    permissions: ['reports:view', 'bookings:view'],
    usesDateRange: true,
    counts:
      "Every booking made in the date range. Confirmed = booking status 'confirmed' or 'attended'. Cancellations = status 'cancelled'. Verified by gateway = payment status 'paid'. Check-ins = bookings marked checked in.",
  },
  {
    key: 'customers',
    label: 'Customer report',
    group: 'Bookings & customers',
    description: 'New users, active bookers and repeat bookers per day.',
    permissions: ['reports:view', 'users:view'],
    usesDateRange: true,
    counts:
      "User accounts created in the date range, and bookings made in it except those with status 'pending_payment' or 'expired' (abandoned at the payment step).",
  },
  {
    key: 'pending_settlements',
    label: 'Pending settlements: payee balances',
    group: 'Settlements & refunds',
    description: 'What each payee has earned, been paid and is still owed, as at the time the report is generated.',
    permissions: [...FIN, 'settlements:view'],
    usesDateRange: false,
    counts:
      "Ledger entries with status 'success' of all dates, for payees other than the platform. Settled = 'settlement' entries with status 'success' (payouts made).",
  },
  {
    key: 'unpaid_settlements',
    label: 'Pending settlements: unpaid settlement records',
    group: 'Settlements & refunds',
    description: 'Settlement records that have not been paid yet, as at the time the report is generated.',
    permissions: [...FIN, 'settlements:view'],
    usesDateRange: false,
    counts:
      "Settlement records whose status is not 'paid': pending, awaiting second approval, approved, failed or on hold.",
  },
  {
    key: 'refunds',
    label: 'Refunds report',
    group: 'Settlements & refunds',
    description: 'Refund requests by status and service, with amounts paid, deductions kept and amounts refunded.',
    permissions: [...FIN, 'refunds:view'],
    usesDateRange: true,
    counts:
      "Refund requests created in the date range, in every status. Processed = the refund was sent to the customer (status 'processed'); requested and approved refunds have not moved any money yet.",
  },
];

export function getReportInfo(key: string): ReportInfo | undefined {
  return REPORT_CATALOG.find((report) => report.key === key);
}

/** File formats every report can be exported in. */
export const EXPORT_FORMATS = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
];

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'csv' || value === 'xlsx' || value === 'pdf';
}

/** How long a generated file is kept before it is deleted, unless an admin changes it. */
export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

/** Shown wherever a generated file or a schedule is offered. */
export const DELIVERY_NOTE =
  'Reports are never emailed: no email provider is connected. Files are delivered by signing in to the admin panel and downloading them from Reports & Exports > Generated Files. The recipients saved on a schedule are kept for the day an email provider is connected.';

export const SCHEDULE_FREQUENCIES = [
  { value: 'daily', label: 'Daily (previous day)' },
  { value: 'weekly', label: 'Weekly (previous Monday to Sunday)' },
  { value: 'monthly', label: 'Monthly (previous calendar month)' },
];

export const reportsResources: ResourceDef[] = [
  {
    name: 'scheduled-reports',
    collection: 'scheduledReports',
    module: 'reports',
    title: 'Scheduled Reports',
    subtitle: 'Saved report schedules and their recipients',
    singular: 'Schedule',
    labelKey: 'name',
    defaultSort: { key: 'createdAt', dir: -1 },
    fields: [
      { key: 'name', label: 'Schedule name', type: 'text', required: true, list: true, search: true },
      {
        key: 'reportType',
        label: 'Report',
        type: 'select',
        required: true,
        list: true,
        filter: true,
        options: REPORT_CATALOG.map((report) => ({ value: report.key, label: report.label })),
      },
      {
        key: 'frequency',
        label: 'Frequency',
        type: 'select',
        required: true,
        list: true,
        filter: true,
        default: 'monthly',
        options: SCHEDULE_FREQUENCIES,
        help: 'Each run covers the last completed period in Asia/Kolkata (IST).',
      },
      {
        key: 'recipients',
        label: 'Recipients (email addresses)',
        type: 'tags',
        required: true,
        list: true,
        help: 'Kept for the day an email provider is connected. Nothing is emailed today: each run is saved under Generated Files, where admins with access to the report sign in and download it.',
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        required: true,
        list: true,
        default: 'xlsx',
        options: EXPORT_FORMATS,
      },
      { key: 'lastRunAt', label: 'Last run', type: 'datetime', readOnly: true, form: false, list: true },
      { key: 'lastRunBy', label: 'Last run by', type: 'text', readOnly: true, form: false },
      { key: 'lastRunPeriod', label: 'Last run period', type: 'text', readOnly: true, form: false },
      { key: 'lastRunStatus', label: 'Last run result', type: 'text', readOnly: true, form: false, list: true },
      { key: 'lastRunError', label: 'Last run error', type: 'text', readOnly: true, form: false },
      {
        key: 'nextRunAt',
        label: 'Next run due',
        type: 'datetime',
        readOnly: true,
        form: false,
        list: true,
        help: 'When the period now in progress completes. The scheduler checks once an hour and generates the file soon after this time.',
      },
    ],
    status: {
      key: 'status',
      initial: 'active',
      options: [
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'paused', label: 'Paused', tone: 'gray' },
      ],
    },
    emptyHint: 'No schedules yet. Add one to have a report generated automatically for each completed day, week or month.',
    sourceNote:
      'An active schedule is run by the scheduler, which checks once an hour: when a period completes (Asia/Kolkata), the report for that period is generated in the chosen format and saved under Generated Files. ' +
      DELIVERY_NOTE,
  },
];
