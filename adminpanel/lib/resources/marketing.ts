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
      { key: 'timesUsed', label: 'Times used', type: 'number', readOnly: true, list: true, help: 'Paid (or free) bookings that redeemed this coupon. An order that was not paid does not count.' },
      { key: 'source', label: 'Issued by', type: 'select', readOnly: true, filter: true, options: [
        { value: 'referral', label: 'Referral programme', tone: 'purple' },
      ] },
      { key: 'restrictedToPhone', label: 'Only for customer', type: 'phone', readOnly: true, search: true, help: 'Set on reward coupons issued to one customer by the referral programme. Nobody else can use the code.' },
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
    sourceNote:
      'Coupons are funded by the platform. The customer pays the discounted price; the organiser or artist still earns on the list price. In the ledger the payment is recorded at the amount actually received and the discount as a separate "coupon discount" adjustment owed to the payee, with commission and GST charged on the list price. A coupon is checked again on the server when the order is placed and is only used up when the payment is confirmed (or at once when it makes the booking free).',
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
      { key: 'rewardType', label: 'Reward type', type: 'select', required: true, default: 'discount', list: true, filter: true, help: 'Every reward is issued as a one-time discount coupon on ticket bookings, valid for 90 days and usable only by the customer it was issued to.', options: [
        { value: 'discount', label: 'Discount coupon' },
        { value: 'credit', label: 'Booking credit (issued as a coupon)' },
      ] },
      { key: 'referrerReward', label: 'Reward for the referrer', type: 'money', required: true, list: true, help: 'Coupon value in rupees for the customer who shared the code. 0 for none.' },
      { key: 'refereeReward', label: 'Reward for the new user', type: 'money', required: true, list: true, help: 'Coupon value in rupees for the new customer. 0 for none.' },
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
      'Customers get their referral code from GET /api/public/referrals/code. A new customer (signed up in the last 7 days, no bookings yet) can enter someone else\'s code once; it is recorded under the programme that is Active and inside its dates at that moment, so keep one programme active at a time. When the new customer\'s first paid booking is confirmed the referral qualifies and the rewards are issued as coupons.',
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
      { key: 'code', label: 'Code used', type: 'text', search: true },
      { key: 'programmeId', label: 'Programme', type: 'ref', ref: { resource: 'referral-programmes', labelKey: 'name' }, list: true, filter: true },
      { key: 'claimedAt', label: 'Code entered', type: 'datetime', list: true },
      { key: 'qualifiedAt', label: 'Qualified', type: 'datetime', list: true },
      { key: 'qualifyingBookingId', label: 'First paid booking', type: 'text' },
      { key: 'referrerCouponCode', label: 'Referrer reward coupon', type: 'text', search: true },
      { key: 'refereeCouponCode', label: 'New customer reward coupon', type: 'text', search: true },
      { key: 'rewardNote', label: 'Reward note', type: 'text' },
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
    emptyHint: 'No referrals have been recorded yet. A row appears when a new customer enters a referral code in the app.',
    sourceNote:
      'Read-only: rows are written when a new customer enters a referral code (POST /api/public/referrals/claim) and updated when their first paid booking is confirmed. "Signed up" means the code was entered; "Qualified" means the first paid booking was confirmed and the rewards were issued as coupons.',
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
        { value: 'event_attendees', label: 'Ticket holders of an event' },
        { value: 'artists', label: 'All artists' },
        { value: 'organisers', label: 'All organisers' },
      ] },
      { key: 'audienceValue', label: 'Audience value', type: 'text', list: true, help: 'The city name, the artist\'s ID or phone number, or the event ID (or exact event name). Leave empty for the other audiences.' },
      { key: 'scheduledFor', label: 'Scheduled for', type: 'datetime', list: true, help: 'When the scheduler sends it (it runs every 15 minutes). Leave empty to send it with "Send now" once approved.' },
      { key: 'submittedBy', label: 'Submitted for approval by', type: 'text', readOnly: true },
      { key: 'approvedBy', label: 'Approved by', type: 'text', readOnly: true },
      { key: 'approvedAt', label: 'Approved at', type: 'datetime', readOnly: true },
      { key: 'lastAttemptAt', label: 'Sending started', type: 'datetime', readOnly: true },
      { key: 'completedAt', label: 'Sending finished', type: 'datetime', readOnly: true },
      { key: 'audienceCount', label: 'Accounts matched when sending started', type: 'number', readOnly: true },
      { key: 'reachableDevices', label: 'Devices reachable when sending started', type: 'number', readOnly: true },
      { key: 'sentCount', label: 'Devices sent to', type: 'number', readOnly: true, list: true },
      { key: 'acceptedCount', label: 'Accepted by provider', type: 'number', readOnly: true, list: true },
      { key: 'failedCount', label: 'Not accepted', type: 'number', readOnly: true },
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
        { value: 'home_banner', label: 'Home screen banner (app banner carousel)' },
        { value: 'home_advertisement', label: 'Home screen advertisement (app sponsored cards)' },
        { value: 'event_listing', label: 'Event listing (no screen shows it yet)' },
        { value: 'event_detail', label: 'Event detail page (no screen shows it yet)' },
        { value: 'checkout', label: 'Checkout (no screen shows it yet)' },
        { value: 'website_home', label: 'Website home page (no screen shows it yet)' },
      ] },
      { key: 'bannerRef', label: 'Artwork: banner or ad title, or image link', type: 'text', required: true, search: true, help: 'The exact title of a banner (Banners screen) or an ad (Advertisements screen), or an https:// link to the image. The banner or ad does not need to be active itself: the promotion shows it while the promotion is live.' },
      { key: 'artworkSource', label: 'Artwork found', type: 'text', readOnly: true },
      { key: 'link', label: 'Opens when tapped', type: 'url', help: 'Optional. Leave empty to use the link of the banner or ad.' },
      { key: 'couponId', label: 'Linked coupon', type: 'ref', ref: { resource: 'coupons', labelKey: 'code', filter: { status: 'active' } }, list: true, help: 'Its code is sent with the banner (couponCode) while the coupon is active.' },
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
      'A promotion that is Scheduled or Live follows its dates: it is Live from "Starts at" until "Ends at", then Ended. While it is Live its artwork is added to the app\'s home banner carousel (GET /api/banners) or sponsored cards (GET /api/ads), highest priority first, with the linked coupon code. Draft promotions are never shown. The other placements are stored for planning only: no app or website screen reads them yet.',
  },
];
