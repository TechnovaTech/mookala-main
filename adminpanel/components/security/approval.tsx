'use client'
import React from 'react'
import Link from 'next/link'
import { Clock, X } from 'lucide-react'

/**
 * A change that needs a second approver is answered with HTTP 202 and
 * `approvalRequired: true`: nothing was changed yet, and the request is
 * waiting under Security & Audit, Approvals. The shared api() helper treats
 * that answer as an error; screens that can send such a change use
 * `apiOrHeld` instead and show the answer as information.
 */
export interface HeldForApproval {
  held: true
  message: string
  approvalId: string | null
}

export type ApiOrHeld<T> = { held: false; data: T } | HeldForApproval

export async function apiOrHeld<T = any>(url: string, options: { method?: string; body?: any } = {}): Promise<ApiOrHeld<T>> {
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

  if (response.status === 202 && data?.approvalRequired) {
    return { held: true, message: data.message || data.error || 'Sent for approval.', approvalId: data.approvalId || null }
  }
  if (!response.ok || (data && data.success === false)) {
    const error: Error & { data?: any; status?: number } = new Error((data && data.error) || `Request failed (${response.status})`)
    error.data = data
    error.status = response.status
    throw error
  }
  return { held: false, data: data as T }
}

/** Information (not an error): the change is waiting for a second approver. */
export function ApprovalHeldNotice({ held, onClose }: { held: HeldForApproval | null; onClose?: () => void }) {
  if (!held) return null
  return (
    <div className="flex items-start gap-3 border rounded-lg px-4 py-3 text-sm mb-4 bg-blue-50 border-blue-200 text-blue-800" role="status" data-testid="approval-held">
      <Clock size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Sent for approval</p>
        <p className="mt-0.5">{held.message}</p>
        <Link href={held.approvalId ? `/security/approvals?id=${held.approvalId}` : '/security/approvals'} className="inline-block mt-1 underline font-medium">
          Open Approvals
        </Link>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
