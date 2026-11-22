'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, ConfirmDialog, NoticeBar, api, formatDate, type Notice } from '@/components/ui'

interface Row {
  phone: string
  type: string
  reportedName: string
  latestReportId: string
  unresolved: number
  totalReports: number
  reasons: string[]
  latestAt: string | null
  account: { id: string; name: string; phone: string; accountStatus: string; accountStatusReason: string | null; href: string } | null
  modes: string[]
  canRestrict: boolean
}

const TYPE_LABELS: Record<string, string> = { user: 'Customer', artist: 'Artist', organizer: 'Organiser', advertiser: 'Advertiser' }
const STATUS_TONE: Record<string, 'green' | 'amber' | 'red'> = { active: 'green', suspended: 'amber', blocked: 'red' }

/**
 * Above the Reported Accounts list: every customer, artist or organiser with an
 * unresolved report, matched to the real account, with restrict and lift
 * buttons. Each action is recorded on the account's latest unresolved report.
 */
export default function ReportedAccountsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [withoutPhone, setWithoutPhone] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ row: Row; action: 'restrict' | 'lift'; mode?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ accounts: Row[]; withoutPhone: number }>('/api/admin/support/reports/accounts')
      setRows(data.accounts)
      setWithoutPhone(data.withoutPhone)
      setError('')
    } catch (e: any) {
      setError(e.message || 'Could not load the reported accounts.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const act = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>(`/api/admin/support/reports/${pending.row.latestReportId}`, {
        method: 'POST',
        body: { action: pending.action, mode: pending.mode, reason },
      })
      setNotice({ type: 'success', text: result.message })
      setPending(null)
      await load()
    } catch (e: any) {
      setPending(null)
      setNotice({ type: 'error', text: e.message || 'Could not change the account.' })
    } finally {
      setBusy(false)
    }
  }

  const noun = pending ? (TYPE_LABELS[pending.row.type] || 'account').toLowerCase() : ''

  return (
    <Card className="mb-6">
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-deep-blue">Accounts with unresolved reports</h2>
          <button type="button" onClick={load} className="text-xs font-medium text-teal hover:underline">
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Reports that are open, under review or escalated, matched to the customer, artist or organiser by the reported phone number. A
          restriction made here is recorded on the account&apos;s latest unresolved report, which is then marked &quot;Action taken&quot;.
        </p>
      </div>
      <div className="px-5 pt-3">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {error && <NoticeBar notice={{ type: 'error', text: error }} />}
      </div>
      {rows && rows.length === 0 && <p className="px-5 pb-5 text-sm text-gray-500">No account has an unresolved report.</p>}
      {rows && rows.length > 0 && (
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
              {rows.map((row) => (
                <tr key={`${row.type}|${row.phone}`} className="align-top" data-phone={row.phone} data-type={row.type}>
                  <td className="px-4 py-3">
                    {row.account ? (
                      <Link href={row.account.href} className="font-medium text-deep-blue hover:underline">
                        {row.account.name || row.reportedName || row.phone}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-800">{row.reportedName || row.phone}</span>
                    )}
                    <div className="text-xs text-gray-500">{row.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{TYPE_LABELS[row.type] || row.type || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone="red">{row.unresolved} unresolved</Badge>
                    <div className="text-xs text-gray-500 mt-1">{row.totalReports} in total</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 capitalize">{row.reasons.map((r) => r.replace(/_/g, ' ')).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <Link href={`/support/reports?id=${row.latestReportId}`} className="text-teal underline">
                      {formatDate(row.latestAt, true)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.account ? (
                      <>
                        <Badge tone={STATUS_TONE[row.account.accountStatus] || 'gray'}>{row.account.accountStatus}</Badge>
                        {row.account.accountStatus !== 'active' && row.account.accountStatusReason && (
                          <div className="text-xs text-gray-500 mt-1 max-w-[14rem] break-words">{row.account.accountStatusReason}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">{row.type === 'advertiser' ? 'Advertisers have no sign-in account' : 'No account has this phone number'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-medium">
                      {row.account && row.canRestrict && row.account.accountStatus === 'active' && row.modes.includes('suspended') && (
                        <button type="button" className="text-amber-700 hover:underline" onClick={() => setPending({ row, action: 'restrict', mode: 'suspended' })}>
                          Suspend
                        </button>
                      )}
                      {row.account && row.canRestrict && row.account.accountStatus !== 'blocked' && row.modes.includes('blocked') && (
                        <button type="button" className="text-red-700 hover:underline" onClick={() => setPending({ row, action: 'restrict', mode: 'blocked' })}>
                          Block
                        </button>
                      )}
                      {row.account && row.canRestrict && row.account.accountStatus !== 'active' && (
                        <button type="button" className="text-green-700 hover:underline" onClick={() => setPending({ row, action: 'lift' })}>
                          Lift restriction
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutPhone > 0 && (
        <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
          {withoutPhone} unresolved report{withoutPhone === 1 ? ' has' : 's have'} no phone number and cannot be matched to an account.
        </p>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === 'lift' ? 'Lift the restriction' : pending?.mode === 'blocked' ? `Block this ${noun}` : `Suspend this ${noun}`}
        message={
          pending ? (
            <>
              <strong>{pending.row.account?.name || pending.row.reportedName || pending.row.phone}</strong>{' '}
              {pending.action === 'lift' ? 'can sign in and use Mookalaa again.' : `cannot sign in or transact while ${pending.mode}.`} The action is recorded on the latest
              report and on the account.
            </>
          ) : null
        }
        confirmLabel={pending?.action === 'lift' ? 'Lift restriction' : pending?.mode === 'blocked' ? 'Block' : 'Suspend'}
        danger={pending?.action !== 'lift'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={act}
        onClose={() => setPending(null)}
      />
    </Card>
  )
}
