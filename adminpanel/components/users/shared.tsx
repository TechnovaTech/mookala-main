'use client'
import React, { useState } from 'react'
import { Badge, ConfirmDialog, api } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'

/* Shared pieces of the User Management screens. */

export type AccountStatus = 'active' | 'suspended' | 'blocked'

export interface VerifiedByAdmin {
  by: string | null
  at: string
  reason: string
}

export interface UserRow {
  id: string
  name: string
  email: string
  phone: string
  city: string
  status: string
  phoneVerified: boolean
  profileCompleted: boolean
  accountStatus: AccountStatus
  isActive: boolean
  accountStatusReason: string | null
  accountStatusBy: string | null
  accountStatusAt: string | null
  verifiedByAdmin: VerifiedByAdmin | null
  genres: string[]
  createdAt: string | null
}

const ACCOUNT_TONES: Record<AccountStatus, Tone> = { active: 'green', suspended: 'amber', blocked: 'red' }
const ACCOUNT_LABELS: Record<AccountStatus, string> = { active: 'No restriction', suspended: 'Suspended', blocked: 'Blocked' }

/** The admin restriction on the account, on its own. */
export function AccountBadge({ status }: { status: AccountStatus }) {
  return <Badge tone={ACCOUNT_TONES[status] || 'gray'}>{ACCOUNT_LABELS[status] || status}</Badge>
}

/**
 * The one status shown for a user everywhere, matching the list views:
 * Blocked, Suspended, Active (profile completed) or Inactive (signed up but
 * the profile is not completed).
 */
export function UserStatusBadge({ user }: { user: { accountStatus: AccountStatus; profileCompleted: boolean } }) {
  if (user.accountStatus === 'blocked') return <Badge tone="red">Blocked</Badge>
  if (user.accountStatus === 'suspended') return <Badge tone="amber">Suspended</Badge>
  if (user.profileCompleted) return <Badge tone="green">Active</Badge>
  return <Badge tone="gray">Inactive</Badge>
}

/** Signup progress written by the apps: pending -> verified (OTP) -> completed (profile). */
export function SignupBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge tone="green">Profile completed</Badge>
  if (status === 'verified') return <Badge tone="blue">Phone verified, profile incomplete</Badge>
  return <Badge tone="gray">Phone not verified</Badge>
}

export function userLabel(user: { name?: string; phone?: string }): string {
  return user.name || user.phone || 'this user'
}

export type UserAction = 'suspend' | 'block' | 'reactivate' | 'verify' | 'unverify' | 'delete'

interface ActionCopy {
  title: string
  confirm: string
  danger: boolean
  done: string
  message: (name: string) => React.ReactNode
}

const ACTIONS: Record<UserAction, ActionCopy> = {
  suspend: {
    title: 'Suspend account',
    confirm: 'Suspend',
    danger: true,
    done: 'Account suspended.',
    message: (name) => (
      <>
        Suspend <strong>{name}</strong>? The account is marked as suspended and can be reactivated later. The reason is
        saved on the account and in the activity log.
      </>
    ),
  },
  block: {
    title: 'Block account',
    confirm: 'Block',
    danger: true,
    done: 'Account blocked.',
    message: (name) => (
      <>
        Block <strong>{name}</strong>? Use this for abuse or fraud. The reason is saved on the account and in the
        activity log.
      </>
    ),
  },
  reactivate: {
    title: 'Reactivate account',
    confirm: 'Reactivate',
    danger: false,
    done: 'Account reactivated.',
    message: (name) => (
      <>
        Remove the restriction on <strong>{name}</strong>? Say why the account is being restored.
      </>
    ),
  },
  verify: {
    title: 'Mark profile as verified',
    confirm: 'Mark as verified',
    danger: false,
    done: 'Profile marked as verified.',
    message: (name) => (
      <>
        Record that an admin has checked <strong>{name}</strong> by hand. Say what was checked (for example a call to
        the customer or an ID seen by support).
      </>
    ),
  },
  unverify: {
    title: 'Clear manual verification',
    confirm: 'Clear mark',
    danger: true,
    done: 'Manual verification cleared.',
    message: (name) => (
      <>
        Remove the manual verification mark from <strong>{name}</strong>? Phone and profile status from the app are not
        changed.
      </>
    ),
  },
  delete: {
    title: 'Delete user',
    confirm: 'Delete user',
    danger: true,
    done: 'User deleted. Their bookings and transactions were kept.',
    message: (name) => (
      <>
        <p>
          Delete the account of <strong>{name}</strong>? This cannot be undone.
        </p>
        <p className="mt-2">
          Bookings and ledger transactions are financial records and are <strong>kept</strong>. They stay searchable by
          the customer&apos;s phone number.
        </p>
      </>
    ),
  },
}

export interface PendingAction {
  action: UserAction
  user: { id: string; name?: string; phone?: string }
}

/**
 * Reason-collecting dialog that performs one account action. `onDone` is
 * called with the success message after the server accepted the change.
 */
export function UserActionDialog({
  pending,
  onClose,
  onDone,
}: {
  pending: PendingAction | null
  onClose: () => void
  onDone: (message: string, action: UserAction) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const copy = pending ? ACTIONS[pending.action] : null

  const close = () => {
    if (busy) return
    setError('')
    onClose()
  }

  const run = async (reason: string) => {
    if (!pending || !copy) return
    if (reason.length < 5) {
      setError('Please write a reason of at least 5 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (pending.action === 'delete') {
        await api(`/api/users/${pending.user.id}`, { method: 'DELETE', body: { reason } })
      } else {
        await api(`/api/users/${pending.user.id}`, { method: 'PATCH', body: { action: pending.action, reason } })
      }
      onDone(copy.done, pending.action)
    } catch (e: any) {
      setError(e?.message || 'The action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title={copy?.title || ''}
      message={
        <>
          {copy && pending ? copy.message(userLabel(pending.user)) : null}
          {error && (
            <p role="alert" className="mt-3 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </>
      }
      confirmLabel={copy?.confirm}
      danger={copy?.danger}
      askReason
      reasonRequired
      busy={busy}
      onConfirm={run}
      onClose={close}
    />
  )
}

/** Compact pager shared by the user tables. */
export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number
  pages: number
  total: number
  onPage: (page: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
      <span>
        {total.toLocaleString('en-IN')} {total === 1 ? 'user' : 'users'} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

/** Tab strip with counts, used for the account views and the verification groups. */
export function CountTabs({
  tabs,
  active,
  counts,
  onChange,
  label,
}: {
  tabs: { value: string; label: string }[]
  active: string
  counts: Record<string, number> | null
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 px-3 pt-3 border-b border-gray-200">
      {tabs.map((tab) => {
        const selected = tab.value === active
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              selected ? 'border-deep-blue text-deep-blue' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${selected ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
              {counts ? (counts[tab.value] ?? 0).toLocaleString('en-IN') : '…'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
