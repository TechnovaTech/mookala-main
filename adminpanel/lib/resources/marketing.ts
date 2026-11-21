import type { ResourceDef } from '../resource-types';

/**
 * Marketing (requirements section 13): coupons, referral programmes, push
 * campaigns and promotional placements.
 *
 * Plain data only: this file is bundled for the browser. The rules (unique
 * coupon codes, the campaign approval workflow) are in marketing.hooks.ts.
 */

/**
 * The same list as SERVICES in lib/ledger.ts, repeated here because that file
 * imports Node modules and cannot be bundled for the browser. The hook checks
 * submitted values against the ledger's own list.
 */
const SERVICE_OPTIONS = [
  { value: 'all', label: 'All services' },
  { value: 'ticketing', label: 'Event ticketing' },
  { value: 'artist_booking', label: 'Artist booking' },
  { value: 'learning', label: 'Learning' },
  { value: 'wishes', label: 'Wishes & greetings' },
  { value: 'membership', label: 'Membership' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'premium_search', label: 'Premium search pass' },
];

export const marketingResources: ResourceDef[] = [
  {
    name: 'coupons',
    collection: 'coupons',
    module: 'marketing',
    title: 'Coupons',
    subtitle: 'Discount codes with validity dates, usage limits and the services they apply to',
    singular: 'Coupon',
    labelKey: 'code',
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, list: true, search: true, help: 'Letters, numbers, hyphens and underscores. Saved in capitals and must be unique.' },
      { key: 'description', label: 'Description', type: 'textarea', search: true },
      { key: 'discountType', label: 'Discount type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'percent', label: 'Percentage' },
        { value: 'flat', label: 'Flat amount' },
      ] },
      { key: 'value', label: 'Value', type: 'number', required: true, min: 0, list: true, help: 'A percentage (1 to 100) or an amount in rupees, depending on the discount type.' },
      { key: 'maxDiscount', label: 'Maximum discount', type: 'money', help: 'The most a percentage coupon can take off one order. Leave empty for no cap.' },
      { key: 'minOrderAmount', label: 'Minimum order amount', type: 'money' },
      { key: 'service', label: 'Applies to', type: 'select', required: true, default: 'all', list: true, filter: true, options: SERVICE_OPTIONS },
      { key: 'validFrom', label: 'Valid from', type: 'datetime', list: true },
      { key: 'validUntil', label: 'Valid until', type: 'datetime', list: true },
      { key: 'usageLimit', label: 'Total usage limit', type: 'number', min: 1, help: 'Leave empty for no limit.' },
      { key: 'perUserLimit', label: 'Limit per customer', type: 'number', min: 1, help: 'Leave empty for no limit.' },
      { key: 'timesUsed', label: 'Times used', type: 'number', readOnly: true, list: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'paused', label: 'Paused', tone: 'amber' },
        { value: 'expired', label: 'Expired', tone: 'red' },
      ],
    },
    emptyHint: 'No coupons have been created yet.',
  },
  {
    name: 'referral-programmes',
    collection: 'referralProgrammes',
    module: 'marketing',
    title: 'Referral Programmes',
    subtitle: 'Rules for rewarding people who bring new users to the platform',
    singular: 'Programme',
    labelKey: 'name',
    fields: [
      { key: 'name', label: 'Programme name', type: 'text', required: true, list: true, search: true },
      { key: 'audience', label: 'Who can refer', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'customers', label: 'Customers' },
        { value: 'artists', label: 'Artists' },
        { value: 'organisers', label: 'Organisers' },
        { value: 'all', label: 'Everyone' },
      ] },
      { key: 'rewardType', label: 'Reward type', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'credit', label: 'Account credit' },
        { value: 'discount', label: 'Discount' },
        { value: 'cash', label: 'Cash' },
      ] },
      { key: 'referrerReward', label: 'Reward for the referrer', type: 'money', required: true, list: true },
      { key: 'refereeReward', label: 'Reward for the new user', type: 'money', required: true, list: true },
      { key: 'conditions', label: 'Conditions', type: 'textarea', help: 'For example: the reward is given after the new user\'s first paid booking.' },
      { key: 'startDate', label: 'Start date', type: 'date', list: true },
      { key: 'endDate', label: 'End date', type: 'date', list: true },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'active', label: 'Active', tone: 'green' },
        { value: 'paused', label: 'Paused', tone: 'amber' },
        { value: 'ended', label: 'Ended', tone: 'red' },
      ],
    },
    emptyHint: 'No referral programmes have been set up yet.',
    sourceNote:
      'Programme rules are stored here, but the mobile apps and website do not offer referral codes or record referrals yet, so no reward is given automatically.',
  },
  {
    name: 'referrals',
    collection: 'referrals',
    module: 'marketing',
    title: 'Referrals',
    subtitle: 'Each person referred to the platform and the reward given for it',
    singular: 'Referral',
    labelKey: 'referredPhone',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    fields: [
      { key: 'referrerPhone', label: 'Referrer phone', type: 'phone', list: true, search: true },
      { key: 'referredPhone', label: 'Referred phone', type: 'phone', list: true, search: true },
      { key: 'programmeId', label: 'Programme', type: 'ref', ref: { resource: 'referral-programmes', labelKey: 'name' }, list: true, filter: true },
      { key: 'status', label: 'Status', type: 'select', list: true, filter: true, options: [
        { value: 'signed_up', label: 'Signed up', tone: 'blue' },
        { value: 'qualified', label: 'Qualified', tone: 'green' },
        { value: 'rejected', label: 'Rejected', tone: 'red' },
      ] },
      { key: 'rewardStatus', label: 'Reward status', type: 'select', list: true, filter: true, options: [
        { value: 'pending', label: 'Pending', tone: 'amber' },
        { value: 'given', label: 'Given', tone: 'green' },
        { value: 'withheld', label: 'Withheld', tone: 'red' },
      ] },
    ],
    emptyHint: 'No referrals have been recorded.',
    sourceNote:
      'This list is read-only and will stay empty for now: the mobile apps and website do not record referrals yet. Records will appear here when the sign-up flow starts writing to the "referrals" collection.',
  },
  {
    name: 'push-campaigns',
    collection: 'pushCampaigns',
    module: 'marketing',
    title: 'Push Campaigns',
    subtitle: 'Push notification campaigns with audience selection, approval and delivery results',
    singular: 'Campaign',
    labelKey: 'title',
    fields: [
      { key: 'title', label: 'Notification title', type: 'text', required: true, list: true, search: true },
      { key: 'message', label: 'Message', type: 'textarea', required: true, search: true },
      { key: 'deepLink', label: 'Deep link', type: 'text', placeholder: 'mookalaa://events/...', help: 'Where the notification opens in the app. Optional.' },
      { key: 'audience', label: 'Audience', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'all_users', label: 'All customers' },
        { value: 'city', label: 'Customers in a city' },
        { value: 'followers_of_artist', label: 'Followers of an artist' },
        { value: 'artists', label: 'All artists' },
        { value: 'organisers', label: 'All organisers' },
      ] },
      { key: 'audienceValue', label: 'Audience value', type: 'text', list: true, help: 'The city name, or the artist\'s ID or phone number. Leave empty for the other audiences.' },
      { key: 'scheduledFor', label: 'Scheduled for', type: 'datetime', list: true },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
      { key: 'lastAttemptAt', label: 'Last send attempt', type: 'datetime', readOnly: true },
      { key: 'audienceCount', label: 'Accounts matched at last attempt', type: 'number', readOnly: true },
      { key: 'acceptedCount', label: 'Accepted by provider', type: 'number', readOnly: true },
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
        { value: 'sending', label: 'Sending', tone: 'amber' },
        { value: 'sent', label: 'Sent', tone: 'green' },
        { value: 'failed', label: 'Failed', tone: 'red' },
        { value: 'cancelled', label: 'Cancelled', tone: 'gray' },
      ],
      approvalRequired: ['approved'],
      reasonRequired: ['cancelled'],
    },
    emptyHint: 'No push campaigns have been created yet.',
  },
  {
    name: 'promotions',
    collection: 'promotions',
    module: 'marketing',
    title: 'Promotions',
    subtitle: 'Banner scheduling and promotional placements, with an optional linked coupon',
    singular: 'Promotion',
    labelKey: 'name',
    defaultSort: { key: 'priority', dir: -1 },
    fields: [
      { key: 'name', label: 'Promotion name', type: 'text', required: true, list: true, search: true },
      { key: 'placement', label: 'Placement', type: 'select', required: true, list: true, filter: true, options: [
        { value: 'home_banner', label: 'Home screen banner' },
        { value: 'home_advertisement', label: 'Home screen advertisement' },
        { value: 'event_listing', label: 'Event listing' },
        { value: 'event_detail', label: 'Event detail page' },
        { value: 'checkout', label: 'Checkout' },
        { value: 'website_home', label: 'Website home page' },
      ] },
      { key: 'bannerRef', label: 'Banner reference or URL', type: 'text', search: true, help: 'The title of a banner from the Banners screen, or a link to the artwork.' },
      { key: 'couponId', label: 'Linked coupon', type: 'ref', ref: { resource: 'coupons', labelKey: 'code' }, list: true },
      { key: 'startsAt', label: 'Starts at', type: 'datetime', required: true, list: true },
      { key: 'endsAt', label: 'Ends at', type: 'datetime', required: true, list: true },
      { key: 'priority', label: 'Priority', type: 'number', default: 0, min: 0, max: 100, list: true, help: 'Higher numbers are shown first when two promotions share a placement.' },
    ],
    status: {
      key: 'status',
      initial: 'draft',
      options: [
        { value: 'draft', label: 'Draft', tone: 'gray' },
        { value: 'scheduled', label: 'Scheduled', tone: 'purple' },
        { value: 'live', label: 'Live', tone: 'green' },
        { value: 'ended', label: 'Ended', tone: 'red' },
      ],
    },
    emptyHint: 'No promotions have been planned yet.',
    sourceNote:
      'This is the planning schedule for promotional placements. The mobile apps and website do not read it yet: what they actually show is controlled from the Banners and Advertisements screens.',
  },
];
