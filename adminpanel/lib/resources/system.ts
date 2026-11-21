import type { ResourceDef } from '../resource-types';

/**
 * System health records (requirements section 18): operational incidents and
 * the log of database backups and restore tests kept by the team.
 */
export const systemResources: ResourceDef[] = [
  {
    name: 'incidents',
    collection: 'incidents',
    module: 'system',
    title: 'Incidents',
    subtitle: 'Operational incidents with severity, timeline, root cause and resolution',
    singular: 'Incident',
    labelKey: 'title',
    defaultSort: { key: 'startedAt', dir: -1 },
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'severity', label: 'Severity', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'sev1', label: 'SEV1: service down', tone: 'red' },
        { value: 'sev2', label: 'SEV2: major feature broken', tone: 'amber' },
        { value: 'sev3', label: 'SEV3: minor impact', tone: 'blue' },
        { value: 'sev4', label: 'SEV4: no customer impact', tone: 'gray' },
      ] },
      { key: 'affectedArea', label: 'Affected area', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'payments', label: 'Payments' },
        { value: 'bookings', label: 'Bookings & ticketing' },
        { value: 'sign_in', label: 'Sign-in & OTP' },
        { value: 'mobile_apps', label: 'Mobile apps' },
        { value: 'website', label: 'Website' },
        { value: 'admin_panel', label: 'Admin panel' },
        { value: 'database', label: 'Database' },
        { value: 'notifications', label: 'Notifications' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'startedAt', label: 'Started at', type: 'datetime', required: true, list: true },
      { key: 'detectedBy', label: 'Detected by', type: 'text', list: true, help: 'Person, customer report or monitor that noticed it.' },
      { key: 'summary', label: 'Summary', type: 'textarea', required: true, help: 'What happened and who was affected.' },
      { key: 'rootCause', label: 'Root cause', type: 'textarea' },
      { key: 'resolution', label: 'Resolution', type: 'textarea', help: 'What was done to fix it and to stop it happening again.' },
      { key: 'resolvedAt', label: 'Resolved at', type: 'datetime', list: true, help: 'Filled in automatically when the incident is marked resolved, if left empty.' },
      { key: 'resolvedBy', label: 'Resolved by', type: 'text', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'open',
      options: [
        { value: 'open', label: 'Open', tone: 'red' },
        { value: 'investigating', label: 'Investigating', tone: 'amber' },
        { value: 'monitoring', label: 'Monitoring', tone: 'blue' },
        { value: 'resolved', label: 'Resolved', tone: 'green' },
      ],
      reasonRequired: ['resolved'],
    },
    emptyHint: 'No incidents have been recorded.',
    sourceNote: 'Incidents are recorded here by the team. Nothing opens an incident automatically.',
  },
  {
    name: 'backups',
    superAdminOnly: true,
    collection: 'backupRecords',
    module: 'system',
    title: 'Backups',
    subtitle: 'Log of database backups and restore tests, and controlled data exports',
    singular: 'Backup record',
    labelKey: 'reference',
    defaultSort: { key: 'takenAt', dir: -1 },
    // The log is evidence that backups were taken: records are corrected, never removed.
    canDelete: false,
    fields: [
      { key: 'takenAt', label: 'Taken at', type: 'datetime', required: true, list: true },
      { key: 'type', label: 'Type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'atlas_snapshot', label: 'Atlas snapshot', tone: 'green' },
        { value: 'logical_export', label: 'Logical export', tone: 'blue' },
        { value: 'manual', label: 'Manual backup', tone: 'purple' },
      ] },
      { key: 'scope', label: 'Scope', type: 'text', required: true, list: true, search: true, placeholder: 'Whole database, or the collections covered' },
      { key: 'size', label: 'Size', type: 'text', list: true, placeholder: 'e.g. 1.4 GB' },
      { key: 'reference', label: 'Location or reference', type: 'text', required: true, search: true, help: 'Atlas snapshot ID or where the file is kept. Never paste credentials or download links with tokens here.' },
      { key: 'takenBy', label: 'Taken by', type: 'text', list: true, search: true, placeholder: 'Person, or "Atlas schedule"' },
      { key: 'restoreTested', label: 'Restore test done', type: 'boolean', list: true, filter: true, help: 'Tick only when this backup was actually restored somewhere and checked.' },
      { key: 'restoreTestedAt', label: 'Restore test date', type: 'date', list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    status: {
      key: 'status',
      initial: 'completed',
      options: [
        { value: 'completed', label: 'Completed', tone: 'green' },
        { value: 'in_progress', label: 'In progress', tone: 'amber' },
        { value: 'failed', label: 'Failed', tone: 'red' },
      ],
      reasonRequired: ['failed'],
    },
    emptyHint: 'No backups have been recorded yet.',
    sourceNote: 'Atlas does not report its snapshots to this application. Record each backup and restore test here after checking it in the Atlas console. Exports run from this page are added automatically.',
  },
];
