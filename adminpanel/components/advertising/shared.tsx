import type { Tone } from '@/lib/resource-types'

/** Labels shared by the advertising screens. */

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  scheduled: { label: 'Approved (scheduled)', tone: 'blue' },
  live: { label: 'Live', tone: 'green' },
  paused: { label: 'Paused', tone: 'amber' },
  completed: { label: 'Completed', tone: 'purple' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  invoiced: { label: 'Invoiced', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'purple' },
}

export const ADVERTISER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  suspended: { label: 'Suspended', tone: 'gray' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export const APPLICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export const PLACEMENT_LABEL: Record<string, string> = {
  home_banner: 'Home banner',
  category_banner: 'Category banner',
  sponsored_card: 'Sponsored card',
  interstitial: 'Interstitial',
}

/** Where the user app shows a placement, or null when no app screen shows it yet. */
export const PLACEMENT_SCREEN: Record<string, string | null> = {
  home_banner: 'Shown with the banners at the top of the user app home screen.',
  sponsored_card: 'Shown with the sponsored ads on the user app home screen.',
  category_banner: null,
  interstitial: null,
}

export const linkClass = 'text-teal font-medium hover:underline'
