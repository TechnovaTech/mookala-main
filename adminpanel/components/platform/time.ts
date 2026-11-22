/**
 * India time helpers for the platform screens. Maintenance windows are
 * entered and shown in Asia/Kolkata (UTC+05:30, no daylight saving) whatever
 * the admin's own computer is set to, because that is the platform timezone.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

/** "10 Jan 2027, 12:00 am IST", or '—'. */
export function formatIst(value: any): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return (
    date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  )
}

/** An ISO time as the value of a datetime-local input, in India time. */
export function toIstInput(value: any): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16)
}

/** A datetime-local value read as India time, as an ISO string ('' when empty or invalid). */
export function fromIstInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return ''
  const date = new Date(value + ':00+05:30')
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export const NOTICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Waiting for approval',
  approved: 'Approved, waiting to be sent',
  scheduled: 'Scheduled',
  sending: 'Being sent',
  sent: 'Sent',
  failed: 'Sending failed',
  cancelled: 'Cancelled',
}
