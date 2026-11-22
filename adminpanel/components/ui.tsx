'use client'
import React, { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import type { Tone } from '@/lib/resource-types'

/* Small shared building blocks for the admin panel screens. */

export const TONE_CLASSES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-deep-blue text-white hover:bg-indigo disabled:bg-gray-300',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 disabled:text-gray-300',
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed ${BUTTON_CLASSES[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" role="dialog" aria-modal="true">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-deep-blue">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Confirmation dialog that can also collect a written reason. Used instead of
 * window.confirm() so sensitive actions always record why they were taken.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  askReason = false,
  reasonRequired = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  askReason?: boolean
  reasonRequired?: boolean
  busy?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={askReason && reasonRequired && !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-gray-700 space-y-4">
        <div>{message}</div>
        {askReason && (
          <div>
            <label htmlFor="confirm-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason {reasonRequired ? '' : '(optional)'}
            </label>
            <textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none"
              placeholder="This is saved in the activity log"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

export type Notice = { type: 'success' | 'error' | 'info'; text: string } | null

/** Server wording for a change held for a second approver (see lib/approvals.ts). */
const HELD_PREFIX = 'Not changed yet.'

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose?: () => void }) {
  if (!notice) return null
  // Screens show caught errors as type "error". A change sent for approval is
  // not a failure, so it is shown as information with a link to Approvals.
  if (notice.type === 'error' && notice.text.startsWith(HELD_PREFIX)) {
    return (
      <div className="flex items-start gap-3 border rounded-lg px-4 py-3 text-sm mb-4 bg-blue-50 border-blue-200 text-blue-800" role="status">
        <Info size={18} className="mt-0.5 shrink-0" />
        <span className="flex-1">
          <span className="font-medium">Sent for approval. </span>
          {notice.text}{' '}
          <a href="/security/approvals" className="underline font-medium">
            Open Approvals
          </a>
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        )}
      </div>
    )
  }
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-700',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }[notice.type]
  const Icon = notice.type === 'success' ? CheckCircle2 : notice.type === 'error' ? AlertTriangle : Info

  return (
    <div className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm mb-4 ${styles}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span className="flex-1">{notice.text}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
      <Loader2 size={22} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16 px-6">
      <p className="text-gray-700 font-medium">{title}</p>
      {hint && <p className="text-sm text-gray-500 mt-1 max-w-xl mx-auto">{hint}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>{children}</div>
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'blue',
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: Tone
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-deep-blue mt-1">{value}</p>
      {hint && <p className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${TONE_CLASSES[tone]}`}>{hint}</p>}
    </Card>
  )
}

export const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none disabled:bg-gray-100'

export function formatDate(value: any, withTime = false): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  // The platform runs on India Standard Time, whatever the viewer's computer is set to.
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function formatMoney(value: any): string {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(amount)) return '—'
  // The minus sign goes before the rupee sign: -₹501, not ₹-501.
  return (amount < 0 ? '-' : '') + '₹' + Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/** fetch() wrapper for admin APIs: sends JSON, returns parsed JSON, redirects to login on 401. */
export async function api<T = any>(url: string, options: { method?: string; body?: any } = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
    throw new Error('Your session has ended. Please sign in again.')
  }

  let data: any = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || (data && data.success === false)) {
    const error: Error & { approvalRequired?: boolean; approvalId?: string | null; status?: number } = new Error(
      (data && data.error) || `Request failed (${response.status})`
    )
    error.status = response.status
    // 202 with approvalRequired: nothing failed, the change is waiting for a second approver.
    if (response.status === 202 && data?.approvalRequired) {
      error.approvalRequired = true
      error.approvalId = data.approvalId || null
    }
    throw error
  }

  return data as T
}
