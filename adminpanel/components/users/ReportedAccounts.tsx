'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useCan } from '@/components/AdminShell'
import { Badge, Card, NoticeBar, api, formatDate, type Notice } from '@/components/ui'
import { AccountBadge, UserActionDialog, type AccountStatus, type PendingAction } from './shared'

interface ReportedAccount {
  phone: string
  type: string
  reportedName: string
  unresolved: number
  totalReports: number
  reasons: string[]
  latestAt: string | null
  account: { id: string; name: string; accountStatus: AccountStatus; accountStatusReason: string | null } | null
}

interface Response {
  canRestrictUsers: boolean
  withoutPhone: number
  accounts: ReportedAccount[]
}

const TYPE_LABELS: Record<string, string> = { user: 'User', artist: 'Artist', organizer: 'Organiser', advertiser: 'Advertiser' }
const ACCOUNT_PATHS: Record<string, string> = { user: '/users/', artist: '/artists/', organizer: '/organizers/' }
const words = (value: string) => value.replace(/_/g, ' ')

/**
 * Shown above the Reported Accounts list: every account that still has an
 * unresolved report, matched to the real account, with a way to open it and
 * (for customers) to suspend or block it on the spot.
 */
export default function ReportedAccounts() {
  const canUsers = useCan('users:view')
  const [data, setData] = useState<Response | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<Response>('/api/users/reported'))
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Could not load the reported accounts.')
    }
  }, [])

  useEffect(() => {
    if (canUsers) load()
  }, [canUsers, load])

  if (!canUsers) return null

  return (
    <Card className="mb-6">
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-deep-blue">Accounts with unresolved reports</h2>
          <button type="button" onClick={load} className="text-xs font-medium text-teal hover:underline">Refresh</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Reports that are open, under review or escalated, matched to the account by the reported phone number. Open the account to
          see its history, or restrict it here. Record what you did on the report itself in the list below.
        </p>
      </div>

      <div className="px-5 pt-3">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
      </div>

      {data && data.accounts.length === 0 && (
        <p className="px-5 pb-5 text-sm text-gray-500">
          No account has an unresolved report{data.withoutPhone > 0 ? ' with a phone number' : ''}.
        </p>
      )}

      {data && data.accounts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="reported-accounts">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3">Reported account</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Reports</th>
                <th scope="col" className="px-4 py-3">Reasons</th>
                <th scope="col" className="px-4 py-3">Latest report</th>
                <th scope="col" className="px-4 py-3">Account status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.accounts.map((row) => {
                const path = ACCOUNT_PATHS[row.type]
                const target = row.account ? { id: row.account.id, name: row.account.name || row.reportedName, phone: row.phone } : null
                return (
                  <tr key={`${row.type}|${row.phone}`} className="align-top" data-phone={row.phone}>
                    <td className="px-4 py-3">
                      {row.account && path ? (
                        <Link href={path + row.account.id} className="font-medium text-deep-blue hover:underline">
                          {row.account.name || row.reportedName || row.phone}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-800">{row.reportedName || row.phone}</span>
                      )}
                      <div className="text-xs text-gray-500">{row.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{TYPE_LABELS[row.type] || row.type || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <Badge tone="red">{row.unresolved} unresolved</Badge>
                      <div className="text-xs text-gray-500 mt-1">{row.totalReports} in total</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{row.reasons.map(words).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(row.latestAt, true)}</td>
                    <td className="px-4 py-3">
                      {row.account ? (
                        <>
                          <AccountBadge status={row.account.accountStatus} />
                          {row.account.accountStatus !== 'active' && row.account.accountStatusReason && (
                            <div className="text-xs text-gray-500 mt-1 max-w-[14rem] break-words">{row.account.accountStatusReason}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {path ? 'No account has this phone number' : 'Advertisers have no sign-in account to restrict'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-medium">
                        {row.account && path && (
                          <Link href={path + row.account.id} className="text-deep-blue hover:underline">
                            Open account
                          </Link>
                        )}
                        {row.type === 'user' && target && data.canRestrictUsers && row.account?.accountStatus === 'active' && (
                          <button type="button" className="text-amber-700 hover:underline" onClick={() => setPending({ action: 'suspend', user: target })}>
                            Suspend
                          </button>
                        )}
                        {row.type === 'user' && target && data.canRestrictUsers && row.account?.accountStatus !== 'blocked' && (
                          <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ action: 'block', user: target })}>
                            Block
                          </button>
                        )}
                        {row.type === 'user' && target && data.canRestrictUsers && row.account?.accountStatus !== 'active' && (
                          <button type="button" className="text-green-700 hover:underline" onClick={() => setPending({ action: 'reactivate', user: target })}>
                            Reactivate
                          </button>
                        )}
                      </div>
                      {row.type !== 'user' && row.account && path && (
                        <p className="text-xs text-gray-500 text-right mt-1">Restrict from the account page</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.withoutPhone > 0 && (
        <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
          {data.withoutPhone} unresolved report{data.withoutPhone === 1 ? ' has' : 's have'} no phone number and cannot be matched to an account.
          Add the reported phone to the report to link it.
        </p>
      )}

      <UserActionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(message) => {
          setPending(null)
          setNotice({ type: 'success', text: message })
          load()
        }}
      />
    </Card>
  )
}
