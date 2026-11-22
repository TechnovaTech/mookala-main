import type { ResourceDef } from '../resource-types';

/**
 * Legal and document management (requirements sections 15 and 19): policies,
 * agreements, consent records, retention schedules and deletion requests.
 *
 * Plain data only: this file is bundled for the browser. The rules (one
 * published policy per type, locked published text, the deletion review
 * workflow) are in legal.hooks.ts.
 */

export const legalResources: ResourceDef[] = [
  {
    name: 'policies',
    collection: 'policies',
    module: 'legal',
    title: 'Policies',
    subtitle: 'Versioned legal policies. One version of each type is published at a time.',
    singular: 'Policy',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'type', label: 'Policy type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'terms', label: 'Terms of use' },
        { value: 'privacy', label: 'Privacy policy' },
        { value: 'refund', label: 'Refund policy' },
        { value: 'cancellation', label: 'Cancellation policy' },
        { value: 'community', label: 'Community guidelines' },
        { value: 'advertiser', label: 'Advertiser terms' },
        { value: 'artist_agreement', label: 'Artist agreement' },
      ] },
      { key: 'version', label: 'Version', type: 'text', required: true, list: true, placeholder: '1.0' },
      { key: 'effectiveDate', label: 'Effective date', type: 'date', required: true, list: true },
      { key: 'body', label: 'Policy text', type: 'textarea', required: true, help: 'Up to 20,000 characters, plain text. The website shows a line starting with "# " or "## " as a heading, lines starting with "- " as a list and **text** in bold; a blank line starts a new paragraph. HTML is shown as text, never run. Once published the text is locked: add a new version to change it.' },
      { key: 'publishedAt', label: 'Published at', type: 'datetime', readOnly: true },
      { key: 'publishedBy', label: 'Published by', type: 'text', readOnly: true },
      { key: 'archivedAt', label: 'Archived at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'published', label: 'Published', tone: 'green' },
        { value: 'archived', label: 'Archived', tone: 'amber' },
      ],
      reasonRequired: ['archived'],
    },
    emptyHint: 'No policies have been written yet.',
  },
  {
    name: 'legal-documents',
    collection: 'legalDocuments',
    module: 'legal',
    title: 'Agreements & Documents',
    subtitle: 'Register of agreements, contracts, licences and operational documents',
    singular: 'Document',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'type', label: 'Document type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'agreement', label: 'Agreement' },
        { value: 'contract', label: 'Contract' },
        { value: 'nda', label: 'NDA' },
        { value: 'licence', label: 'Licence' },
        { value: 'operational', label: 'Operational document' },
      ] },
      { key: 'counterparty', label: 'Counterparty', type: 'text', list: true, search: true },
      { key: 'reference', label: 'Reference number', type: 'text', search: true },
      { key: 'storageUrl', label: 'Link to the stored file', type: 'url', help: 'Where the signed copy is kept, for example a shared drive link.' },
      { key: 'signedOn', label: 'Signed on', type: 'date', list: true },
      { key: 'expiresOn', label: 'Expires on', type: 'date', list: true },
      { key: 'owner', label: 'Owner (admin email)', type: 'email', list: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'expired', label: 'Expired', tone: 'amber' },
        { value: 'terminated', label: 'Terminated', tone: 'red' },
      ],
      reasonRequired: ['terminated'],
    },
    emptyHint: 'No agreements or documents have been registered yet.',
    sourceNote:
      'The admin panel has no file store, so documents cannot be uploaded here. Keep each file where your team stores documents and record its link in this register.',
  },
  {
    name: 'consent-records',
    collection: 'consentRecords',
    module: 'legal',
    title: 'Consent Records',
    subtitle: 'What each person agreed to, which policy version, when and through which channel',
    singular: 'Consent record',
    labelKey: 'subjectPhone',
    fields: [
      { key: 'subjectPhone', label: 'Phone number', type: 'phone', required: true, list: true, search: true },
      { key: 'subjectType', label: 'Account type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'user', label: 'Customer' },
        { value: 'artist', label: 'Artist' },
        { value: 'organizer', label: 'Organiser' },
        { value: 'advertiser', label: 'Advertiser' },
      ] },
      { key: 'consentType', label: 'Consent for', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'terms', label: 'Terms of use' },
        { value: 'privacy', label: 'Privacy policy' },
        { value: 'marketing', label: 'Marketing messages' },
        { value: 'media_use', label: 'Use of photos and media' },
      ] },
      { key: 'policyVersion', label: 'Policy version', type: 'text', list: true },
      { key: 'givenAt', label: 'Given at', type: 'datetime', required: true, list: true },
      { key: 'channel', label: 'Given through', type: 'select', required: true, filter: true, options: [
        { value: 'app', label: 'Mobile app' },
        { value: 'website', label: 'Website' },
        { value: 'paper', label: 'Paper form' },
        { value: 'email', label: 'Email' },
        { value: 'phone', label: 'Phone call' },
      ] },
      { key: 'withdrawnAt', label: 'Withdrawn at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'given',
      options: [
        { value: 'given', label: 'Given', tone: 'green' },
        { value: 'withdrawn', label: 'Withdrawn', tone: 'red' },
      ],
      reasonRequired: ['withdrawn'],
    },
    emptyHint: 'No consent has been recorded yet.',
    sourceNote:
      'The mobile apps and website do not record consent yet, so nothing is added here automatically. Consent collected by other means (paper, email, phone) can be recorded by hand.',
  },
  {
    name: 'retention-schedules',
    collection: 'retentionSchedules',
    module: 'legal',
    title: 'Retention Schedules',
    subtitle: 'How long each category of data is kept, the legal basis and what happens at the end',
    singular: 'Schedule',
    labelKey: 'dataCategory',
    fields: [
      { key: 'dataCategory', label: 'Data category', type: 'text', required: true, list: true, search: true, placeholder: 'KYC documents' },
      { key: 'dataCollection', label: 'Where it is stored', type: 'text', list: true, search: true, help: 'The database collection or system that holds this data, for example "artists".' },
      { key: 'retentionMonths', label: 'Retention period (months)', type: 'number', required: true, min: 1, max: 1200, list: true },
      { key: 'legalBasis', label: 'Legal basis', type: 'textarea', required: true },
      { key: 'actionAtEnd', label: 'Action at end of period', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'delete', label: 'Delete' },
        { value: 'anonymise', label: 'Anonymise' },
        { value: 'archive', label: 'Archive' },
      ] },
      { key: 'owner', label: 'Owner (admin email)', type: 'email', list: true },
    ],
    status: {
      key: 'status',
      initial: 'under_review',
      options: [
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'under_review', label: 'Under review', tone: 'amber' },
      ],
    },
    emptyHint: 'No retention schedules have been defined yet.',
    sourceNote:
      'Schedules are the documented policy. Nothing deletes, anonymises or archives data automatically at the end of a period: the owner acts on each schedule by hand.',
  },
  {
    name: 'deletion-requests',
    collection: 'deletionRequests',
    module: 'legal',
    title: 'Deletion Requests',
    subtitle: 'Requests to delete personal data, with review, legal hold and a recorded outcome',
    singular: 'Deletion request',
    labelKey: 'requesterName',
    fields: [
      { key: 'requesterName', label: 'Requester name', type: 'text', required: true, list: true, search: true },
      { key: 'requesterPhone', label: 'Requester phone', type: 'phone', required: true, list: true, search: true },
      { key: 'accountType', label: 'Account type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'user', label: 'Customer' },
        { value: 'artist', label: 'Artist' },
        { value: 'organizer', label: 'Organiser' },
      ] },
      { key: 'receivedOn', label: 'Request received on', type: 'date', required: true, list: true },
      { key: 'requestedThrough', label: 'Requested through', type: 'select', required: true, filter: true, options: [
        { value: 'email', label: 'Email' },
        { value: 'phone', label: 'Phone call' },
        { value: 'app', label: 'Mobile app' },
        { value: 'website', label: 'Website' },
        { value: 'letter', label: 'Letter' },
      ] },
      { key: 'scope', label: 'Scope', type: 'textarea', required: true, help: 'What the person asked to have deleted, for example "whole account" or "profile photo and marketing data".' },
      { key: 'legalHold', label: 'Legal hold', type: 'boolean', list: true, filter: true, help: 'Tick when the data must be kept for a dispute, investigation or legal duty. A request on hold cannot be approved or completed.' },
      { key: 'reviewNotes', label: 'Review notes', type: 'textarea' },
      { key: 'outcome', label: 'Recorded outcome', type: 'textarea', readOnly: true },
      { key: 'outcomeRecordedBy', label: 'Outcome recorded by', type: 'text', readOnly: true },
      { key: 'outcomeRecordedAt', label: 'Outcome recorded at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'requested',
      options: [
        { value: 'requested', label: 'Requested', tone: 'blue' },
        { value: 'under_review', label: 'Under review', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'purple' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
        { value: 'completed', label: 'Completed', tone: 'green' },
      ],
      reasonRequired: ['rejected', 'approved'],
    },
    emptyHint: 'No deletion requests have been received.',
    sourceNote:
      'The mobile apps and website have no "delete my account" request yet, so requests are entered here when they arrive by email, phone or letter.',
  },
];
