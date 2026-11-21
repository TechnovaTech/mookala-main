import type { FieldDef, ResourceDef, StatusDef } from '../resource-types';

/**
 * Wishes and greetings (requirements section 7).
 *
 * Template orders and custom wishes share the `wishOrders` collection, split
 * by `kind`. No app or website screen places these orders yet, so they are
 * entered by the team. The workflow rules (which status may follow which, the
 * stage timestamps and the ledger entries) live in wishes.hooks.ts.
 */

const CHANNEL = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'in_app', label: 'In the app' },
];

const orderStatus: StatusDef = {
  key: 'status',
  initial: 'created',
  options: [
    { value: 'created', label: 'Created', tone: 'gray' },
    { value: 'paid', label: 'Paid', tone: 'blue' },
    { value: 'processing', label: 'Processing', tone: 'amber' },
    { value: 'delivered', label: 'Delivered', tone: 'green' },
    { value: 'failed', label: 'Failed', tone: 'red' },
    { value: 'delayed', label: 'Delayed', tone: 'amber' },
    { value: 'disputed', label: 'Disputed', tone: 'red' },
    { value: 'cancelled', label: 'Cancelled', tone: 'gray' },
    { value: 'refunded', label: 'Refunded', tone: 'purple' },
  ],
  reasonRequired: ['failed', 'delayed', 'disputed', 'cancelled', 'refunded'],
};

const customerFields: FieldDef[] = [
  { key: 'customerName', label: 'Customer name', type: 'text', required: true, list: true, search: true },
  { key: 'customerPhone', label: 'Customer phone', type: 'phone', required: true, list: true, search: true },
];

const deliveryFields: FieldDef[] = [
  { key: 'recipientName', label: 'Recipient name', type: 'text', required: true, list: true, search: true },
  { key: 'message', label: 'Message', type: 'textarea' },
  { key: 'deliveryChannel', label: 'Delivery channel', type: 'select', options: CHANNEL, required: true, list: true, filter: true },
  {
    key: 'deliveryContact',
    label: 'Delivery contact',
    type: 'text',
    required: true,
    search: true,
    help: 'The phone number or email address the wish is sent to.',
  },
  { key: 'scheduledFor', label: 'Scheduled for', type: 'datetime', list: true },
];

const paymentReferenceField: FieldDef = {
  key: 'paymentReference',
  label: 'Payment reference',
  type: 'text',
  search: true,
  help: 'The bank, UPI or receipt reference the team was given. It is needed before the order can be marked "Paid" and is not checked with the payment gateway.',
};

/** Set by the server as the order moves through its stages; never typed in. */
const timelineFields: FieldDef[] = [
  { key: 'paidAt', label: 'Marked paid at', type: 'datetime', readOnly: true },
  { key: 'processingAt', label: 'Processing started at', type: 'datetime', readOnly: true },
  { key: 'deliveredAt', label: 'Delivered at', type: 'datetime', readOnly: true },
  { key: 'failedAt', label: 'Last marked failed at', type: 'datetime', readOnly: true },
  { key: 'delayedAt', label: 'Last marked delayed at', type: 'datetime', readOnly: true },
  { key: 'disputedAt', label: 'Last marked disputed at', type: 'datetime', readOnly: true },
  { key: 'cancelledAt', label: 'Cancelled at', type: 'datetime', readOnly: true },
  { key: 'refundedAt', label: 'Refunded at', type: 'datetime', readOnly: true },
  { key: 'ledgerReference', label: 'Ledger payment entry', type: 'text', readOnly: true },
  { key: 'refundReference', label: 'Ledger refund entry', type: 'text', readOnly: true },
];

const ORDER_NOTE =
  'Ordering from the mobile apps and website is not wired yet, so orders are entered here by the team. Payments are not connected to the payment gateway: "Paid" means the team confirmed the money and writes the payment to the finance ledger as recorded by an admin; "Refunded" writes the refund entry and does not send money back. Nothing is sent to the recipient from this screen; update the status as the team delivers the wish.';

export const wishesResources: ResourceDef[] = [
  {
    name: 'greeting-categories',
    collection: 'greetingCategories',
    module: 'wishes',
    title: 'Greeting Categories',
    subtitle: 'Occasions that greeting templates are grouped under',
    singular: 'Category',
    labelKey: 'name',
    defaultSort: { key: 'name', dir: 1 },
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, list: true, search: true },
      { key: 'description', label: 'Description', type: 'textarea', list: true },
      { key: 'sortOrder', label: 'Display order', type: 'number', min: 0, list: true, help: 'Lower numbers are listed first.' },
    ],
    status: {
      key: 'status',
      initial: 'active',
      options: [
        { value: 'active', label: 'Active (on sale)', tone: 'green' },
        { value: 'hidden', label: 'Hidden (off sale)', tone: 'gray' },
      ],
      reasonRequired: ['hidden'],
    },
    emptyHint: 'No greeting categories yet. Add occasions such as birthdays, weddings and festivals.',
    sourceNote:
      'Hiding a category takes every template in it off sale without deleting anything: no new order can be created for those templates and the app-facing list stops returning them. A category that has templates cannot be deleted.',
  },
  {
    name: 'greeting-templates',
    collection: 'greetingTemplates',
    module: 'wishes',
    title: 'Greeting Templates',
    subtitle: 'Ready-made greetings, their pricing and approval',
    singular: 'Template',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, list: true, search: true },
      { key: 'category', label: 'Category', type: 'ref', ref: { resource: 'greeting-categories', labelKey: 'name' }, required: true, list: true, filter: true },
      { key: 'occasion', label: 'Occasion', type: 'text', list: true, search: true, placeholder: 'e.g. Birthday, Diwali' },
      { key: 'language', label: 'Language', type: 'text', list: true },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        list: true,
        filter: true,
        options: [
          { value: 'image', label: 'Image' },
          { value: 'video', label: 'Video' },
          { value: 'audio', label: 'Audio' },
          { value: 'text', label: 'Text' },
        ],
      },
      { key: 'previewUrl', label: 'Preview link', type: 'url', help: 'A link to the image, video or audio file. Files cannot be uploaded here.' },
      {
        key: 'price',
        label: 'Price',
        type: 'money',
        required: true,
        list: true,
        help: 'Changing anything on an approved template, including its price, needs a reason. The old and new price are kept in the change history.',
      },
      { key: 'createdByArtist', label: 'Created by (artist name)', type: 'text', search: true },
      { key: 'submittedAt', label: 'Sent for approval at', type: 'datetime', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'rejectedAt', label: 'Rejected at', type: 'datetime', readOnly: true },
      { key: 'unavailableAt', label: 'Taken off sale at', type: 'datetime', readOnly: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'pending_approval', label: 'Pending approval', tone: 'amber' },
        { value: 'approved', label: 'Approved', tone: 'green' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
        { value: 'unavailable', label: 'Unavailable (off sale)', tone: 'gray' },
      ],
      reasonRequired: ['rejected', 'unavailable'],
    },
    emptyHint: 'No greeting templates yet. Add a category first, then add templates under it.',
    sourceNote:
      'A template goes Draft → Pending approval → Approved or Rejected. Approving needs the "approve" permission for Wishes & greetings. Only an approved template in an active category is on sale; "Unavailable" takes it off sale without deleting it. The mobile apps and website do not show greeting templates yet (the read endpoints /api/public/wishes/templates and /api/public/wishes/categories are ready for them), ordering from the apps is not wired, and artists cannot submit templates from the app, so templates are entered here by the team.',
  },
  {
    name: 'wish-orders',
    collection: 'wishOrders',
    module: 'wishes',
    title: 'Orders & Delivery',
    subtitle: 'Template orders from creation and payment through processing and delivery',
    singular: 'Order',
    labelKey: 'recipientName',
    scope: { kind: 'template' },
    fields: [
      ...customerFields,
      {
        key: 'template',
        label: 'Template',
        type: 'ref',
        ref: { resource: 'greeting-templates', labelKey: 'title' },
        required: true,
        list: true,
        filter: true,
        help: 'Only an approved template in an active category can be ordered.',
      },
      ...deliveryFields,
      {
        key: 'amount',
        label: 'Amount',
        type: 'money',
        list: true,
        help: "Leave empty to charge the template's current price. It cannot be changed once the order is marked paid.",
      },
      paymentReferenceField,
      { key: 'listPrice', label: 'Template price when ordered', type: 'money', readOnly: true },
      ...timelineFields,
    ],
    status: orderStatus,
    emptyHint: 'No template orders yet.',
    sourceNote: ORDER_NOTE,
  },
  {
    name: 'custom-wishes',
    collection: 'wishOrders',
    module: 'wishes',
    title: 'Custom Wishes',
    subtitle: 'Personal wishes requested from an artist, from brief to delivery',
    singular: 'Custom wish',
    labelKey: 'recipientName',
    scope: { kind: 'custom' },
    fields: [
      ...customerFields,
      {
        key: 'artistName',
        label: 'Artist',
        type: 'text',
        readOnly: true,
        list: true,
        search: true,
        help: 'Chosen from the approved artists with "Assign artist" after the wish is saved.',
      },
      { key: 'brief', label: 'Brief', type: 'textarea', required: true, help: 'What the customer wants the artist to say or perform.' },
      { key: 'agreedPrice', label: 'Agreed price', type: 'money', help: 'The price agreed with the artist and customer. "Amount" below is what the customer is charged.' },
      { key: 'dueDate', label: 'Due date', type: 'date', list: true, help: 'A wish that is past this date and not delivered is listed as overdue on the Delivery monitor.' },
      ...deliveryFields,
      {
        key: 'amount',
        label: 'Amount',
        type: 'money',
        required: true,
        list: true,
        help: 'What the customer is charged. It cannot be changed once the wish is marked paid.',
      },
      paymentReferenceField,
      ...timelineFields,
    ],
    status: orderStatus,
    emptyHint: 'No custom wishes have been requested yet.',
    sourceNote:
      ORDER_NOTE +
      ' After saving a custom wish, open it and use "Assign artist" to choose one of the approved artists: the wish cannot be marked paid without one, and the payment is recorded in the ledger as owed to that artist, less the commission rule for wishes.',
  },
];
