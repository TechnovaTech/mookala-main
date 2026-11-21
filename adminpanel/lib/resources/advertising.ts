import type { ResourceDef } from '../resource-types';

/**
 * Advertisers, packages, applications, campaigns and billing (requirements
 * section 8). The banner and sponsored-ad screens under /banners and /ads are
 * separate and are not defined here.
 *
 * No app or website screen lets a business register as an advertiser or book
 * a campaign yet, so these records are entered by the team. The workflow is:
 * advertiser (verified) -> application (approved, which creates the campaign)
 * -> campaign (creative uploaded, approved, live on its dates) -> invoice
 * (paid, which writes to the ledger). The rules live in advertising.hooks.ts.
 */

export const PLACEMENT = [
  { value: 'home_banner', label: 'Home banner (top of the app home screen)' },
  { value: 'sponsored_card', label: 'Sponsored card (app home screen)' },
  { value: 'category_banner', label: 'Category banner (no app screen yet)' },
  { value: 'interstitial', label: 'Interstitial (no app screen yet)' },
];

export const advertisingResources: ResourceDef[] = [
  {
    name: 'advertisers',
    collection: 'advertisers',
    module: 'ads',
    title: 'Advertisers',
    subtitle: 'Businesses that advertise on Mookalaa, and whether each one is verified',
    singular: 'Advertiser',
    labelKey: 'businessName',
    fields: [
      { key: 'businessName', label: 'Business name', type: 'text', required: true, list: true, search: true },
      { key: 'contactName', label: 'Contact name', type: 'text', required: true, list: true, search: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true, list: true, search: true },
      { key: 'email', label: 'Email', type: 'email', search: true },
      { key: 'city', label: 'City', type: 'text', list: true, search: true },
      { key: 'gstNumber', label: 'GST number', type: 'text', search: true, placeholder: '15-character GSTIN' },
      { key: 'businessCategory', label: 'Business category', type: 'text', list: true, placeholder: 'e.g. Restaurant, Music school' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'address', label: 'Business address', type: 'textarea' },
      { key: 'listingDescription', label: 'Business listing', type: 'textarea', help: 'What the business does, as it should be described on its listing.' },
    ],
    status: {
      key: 'status',
      initial: 'pending',
      options: [
        { value: 'pending', label: 'Pending', tone: 'amber' },
        { value: 'verified', label: 'Verified', tone: 'green' },
        { value: 'suspended', label: 'Suspended', tone: 'gray' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
      ],
      reasonRequired: ['suspended', 'rejected'],
    },
    emptyHint: 'No advertisers yet.',
    sourceNote:
      'The mobile apps and website have no advertiser sign-up yet, so advertiser accounts are registered here by the team. A new advertiser is Pending until it is verified; only a verified advertiser can have an application approved or a campaign go live. Suspending or rejecting an advertiser pauses its running campaigns.',
  },
  {
    name: 'ad-packages',
    collection: 'adPackages',
    module: 'ads',
    title: 'Advertising Packages',
    subtitle: 'What an advertiser can buy: placement, duration and price',
    singular: 'Package',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, list: true, search: true },
      { key: 'placement', label: 'Placement', type: 'select', options: PLACEMENT, required: true, list: true, filter: true },
      { key: 'durationDays', label: 'Duration (days)', type: 'number', required: true, min: 1, list: true },
      { key: 'price', label: 'Price', type: 'money', required: true, list: true },
      { key: 'impressionsIncluded', label: 'Impressions included', type: 'number', min: 0, list: true, help: 'Leave empty when the package is sold by duration only. This is what was sold: a campaign is not stopped when the number is reached.' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    status: {
      key: 'status',
      initial: 'active',
      options: [
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'retired', label: 'Retired', tone: 'gray' },
      ],
    },
    emptyHint: 'No packages yet. Add the placements and prices you sell.',
  },
  {
    name: 'ad-applications',
    collection: 'adApplications',
    module: 'ads',
    title: 'Advertisement Applications',
    subtitle: 'Requests from advertisers to run a campaign',
    singular: 'Application',
    labelKey: 'applicationLabel',
    fields: [
      { key: 'advertiser', label: 'Advertiser', type: 'ref', ref: { resource: 'advertisers', labelKey: 'businessName' }, required: true, list: true, filter: true },
      { key: 'package', label: 'Package', type: 'ref', ref: { resource: 'ad-packages', labelKey: 'name' }, required: true, list: true, filter: true },
      { key: 'requestedStartDate', label: 'Requested start date', type: 'date', required: true, list: true },
      { key: 'targetLocations', label: 'Target locations', type: 'tags', list: true, placeholder: 'Cities, separated by commas' },
      { key: 'creativeUrl', label: 'Creative link', type: 'url', help: 'Optional link to the banner image, if the advertiser sent one. The image file itself is uploaded on the campaign.' },
      { key: 'clickUrl', label: 'Click-through link', type: 'url', help: 'Where a person is taken when they tap the advertisement.' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'applicationLabel', label: 'Application', type: 'text', readOnly: true },
      { key: 'campaign', label: 'Campaign created', type: 'ref', ref: { resource: 'ad-campaigns', labelKey: 'name' }, readOnly: true, list: true },
    ],
    status: {
      key: 'status',
      initial: 'pending',
      options: [
        { value: 'pending', label: 'Pending', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'green' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
      ],
      reasonRequired: ['rejected'],
    },
    emptyHint: 'No advertisement applications yet.',
    sourceNote:
      'The mobile apps and website have no form for advertisers to apply yet, so applications are entered here by the team. Approving an application creates its campaign as a draft, filled in from the application (dates run from the requested start date for the length of the package). The advertiser must be verified first. Rejecting needs a reason.',
  },
  {
    name: 'ad-campaigns',
    collection: 'adCampaigns',
    module: 'ads',
    title: 'Campaigns',
    subtitle: 'Campaign schedule, targeting, approval and performance counters',
    singular: 'Campaign',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Campaign name', type: 'text', required: true, list: true, search: true },
      { key: 'advertiser', label: 'Advertiser', type: 'ref', ref: { resource: 'advertisers', labelKey: 'businessName' }, required: true, list: true, filter: true },
      { key: 'package', label: 'Package', type: 'ref', ref: { resource: 'ad-packages', labelKey: 'name' }, filter: true },
      { key: 'placement', label: 'Placement', type: 'select', options: PLACEMENT, required: true, list: true, filter: true },
      { key: 'startDate', label: 'Start date', type: 'date', required: true, list: true },
      { key: 'endDate', label: 'End date', type: 'date', required: true, list: true },
      { key: 'targetLocations', label: 'Target locations', type: 'tags', placeholder: 'Cities, separated by commas', help: 'The campaign is shown only to app users whose profile city is one of these. Leave empty to show it in every city.' },
      { key: 'targetCategories', label: 'Target categories', type: 'tags', placeholder: 'Event or content categories, separated by commas', help: 'Recorded for the team only. The apps target advertisements by city; they do not filter by category yet.' },
      { key: 'creativeUrl', label: 'Creative link', type: 'url', help: 'Only when the image is hosted elsewhere. To upload the image file, save the campaign and open it: the upload is in the campaign view.' },
      { key: 'clickUrl', label: 'Click-through link', type: 'url', help: 'Where a person is taken when they tap the advertisement.' },
      { key: 'budget', label: 'Budget', type: 'money' },
      { key: 'hasCreative', label: 'Creative uploaded', type: 'boolean', readOnly: true, list: true },
      { key: 'impressions', label: 'Impressions', type: 'number', readOnly: true, list: true },
      { key: 'clicks', label: 'Clicks', type: 'number', readOnly: true, list: true },
      { key: 'application', label: 'From application', type: 'ref', ref: { resource: 'ad-applications', labelKey: 'applicationLabel' }, readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'scheduled', label: 'Approved (scheduled)', tone: 'blue' },
        { value: 'live', label: 'Live', tone: 'green' },
        { value: 'paused', label: 'Paused', tone: 'amber' },
        { value: 'completed', label: 'Completed', tone: 'purple' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
      ],
      reasonRequired: ['rejected', 'paused'],
    },
    emptyHint: 'No campaigns yet. Add a verified advertiser first, then create the campaign.',
    sourceNote:
      'Campaigns are created by approving an application, or entered here by the team. Approve a draft by setting it to "Approved (scheduled)": it needs a verified advertiser and a creative. An approved campaign goes live by itself on its start date and is completed after its end date. While live it is shown in the user app: "Sponsored card" campaigns among the sponsored ads and "Home banner" campaigns among the home banners, limited to its target cities when it has any. Pausing or rejecting needs a reason.',
  },
  {
    name: 'ad-payments',
    // Payments are recorded by Finance; the module's own team can see them.
    managePermission: 'finance:manage',
    collection: 'adPayments',
    module: 'ads',
    title: 'Advertisement Payments',
    subtitle: 'Invoices raised to advertisers and the payments recorded against them',
    singular: 'Invoice',
    labelKey: 'invoiceNumber',
    fields: [
      { key: 'invoiceNumber', label: 'Invoice number', type: 'text', readOnly: true, list: true, search: true },
      { key: 'advertiser', label: 'Advertiser', type: 'ref', ref: { resource: 'advertisers', labelKey: 'businessName' }, required: true, list: true, filter: true },
      { key: 'campaign', label: 'Campaign', type: 'ref', ref: { resource: 'ad-campaigns', labelKey: 'name' }, list: true, filter: true },
      { key: 'amount', label: 'Amount (before GST)', type: 'money', required: true, list: true },
      { key: 'gstAmount', label: 'GST amount', type: 'money', required: true, default: 0, list: true },
      { key: 'total', label: 'Total (incl. GST)', type: 'money', readOnly: true, list: true },
      { key: 'dueDate', label: 'Due date', type: 'date', list: true, help: 'Left empty, the invoice is due 15 days after it is raised. An unpaid invoice becomes Overdue the day after this date.' },
      { key: 'paidOn', label: 'Paid on', type: 'date', list: true, help: 'Left empty, the date the invoice is marked paid is used.' },
      {
        key: 'method',
        label: 'Payment method',
        type: 'select',
        options: [
          { value: 'bank_transfer', label: 'Bank transfer' },
          { value: 'upi', label: 'UPI' },
          { value: 'cheque', label: 'Cheque' },
          { value: 'cash', label: 'Cash' },
          { value: 'gateway', label: 'Payment gateway' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'gatewayPaymentId',
        label: 'Gateway payment ID',
        type: 'text',
        search: true,
        help: 'Only fill this in when the money came through the payment gateway and you have its payment ID. It is not checked with the gateway.',
      },
    ],
    status: {
      key: 'status',
      initial: 'invoiced',
      options: [
        { value: 'invoiced', label: 'Invoiced', tone: 'blue' },
        { value: 'paid', label: 'Paid', tone: 'green' },
        { value: 'overdue', label: 'Overdue', tone: 'red' },
        { value: 'refunded', label: 'Refunded', tone: 'purple' },
      ],
      reasonRequired: ['refunded'],
    },
    emptyHint: 'No advertisement invoices yet.',
    sourceNote:
      'Advertising payments are not connected to the payment gateway: each payment here is recorded by the team. Invoices are numbered by the server. Raise one from a campaign (its package price plus GST) or add one here. An unpaid invoice becomes Overdue the day after its due date. Marking an invoice Paid writes the payment and its GST to the finance ledger; Refunded writes the refund.',
  },
];
