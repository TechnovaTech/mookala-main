'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Button, ConfirmDialog, NoticeBar, api, formatDate, type Notice } from '@/components/ui'

interface ReportAccount {
  report: { _id: string; reportedType: string; reportedPhone: string; reportedName: string; status: string }
  account: { id: string; name: string; phone: string; accountStatus: string; accountStatusReason: string | null; accountStatusBy: string | null; accountStatusAt: string | null; href: string } | null
  accountActions: { at: string; by: string; byName: string | null; action: string; accountType: string; from: string; to: string; reason: string }[]
  restrictable: boolean
  modes: string[]
  canRestrict: boolean
  neededPermission: string | null
}

const TYPE_LABEL: Record<string, string> = { user: 'customer', artist: 'artist', organizer: 'organiser', advertiser: 'advertiser' }
const STATUS_TONE: Record<string, 'green' | 'amber' | 'red'> = { active: 'green', suspended: 'amber', blocked: 'red' }

/**
 * Inside a report: the reported account, its restriction, and restrict / lift
 * buttons whose action is recorded on this report. After an action the report
 * is opened again so its status and change history show the action.
 */
export default function ReportPanel({ reportId }: { reportId: string }) {
  const [data, setData] = useState<ReportAccount | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ action: 'restrict' | 'lift'; mode?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<ReportAccount>(`/api/admin/support/reports/${reportId}`))
      setError('')
    } catch (e: any) {
      setError(e.message || 'Could not load the reported account.')
    }
  }, [reportId])

  useEffect(() => {
    load()
  }, [load])

  const act = async (reason: string) => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>(`/api/admin/support/reports/${reportId}`, {
        method: 'POST',
        body: { action: pending.action, mode: pending.mode, reason },
      })
      setPending(null)
      setNotice({ type: 'success', text: result.message + ' Reloading the report...' })
      // Reopen the report so the list, its status and its change history are current.
      window.location.assign(`/support/reports?id=${reportId}`)
    } catch (e: any) {
      setPending(null)
      setNotice({ type: 'error', text: e.message || 'Could not change the account.' })
    } finally {
      setBusy(false)
    }
  }

  if (error) return <NoticeBar notice={{ type: 'error', text: error }} />
  if (!data) return <p className="text-sm text-gray-500">Looking up the reported account...</p>

  const noun = TYPE_LABEL[data.report.reportedType] || 'account'
  const account = data.account

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3" data-testid="report-account">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Reported {noun}:</span>
        {account ? (
          <>
            <Link href={account.href} className="font-medium text-deep-blue hover:underline">
              {account.name || account.phone}
            </Link>
            <span className="text-gray-500">{account.phone}</span>
            <Badge tone={STATUS_TONE[account.accountStatus] || 'gray'}>{account.accountStatus}</Badge>
          </>
        ) : (
          <span className="text-gray-700">
            {!data.restrictable ? 'Advertisers have no sign-in account to restrict.' : 'No account has the reported phone number. Correct the phone on the report to link it.'}
          </span>
        )}
      </div>
      {account && account.accountStatus !== 'active' && account.accountStatusReason && (
        <p className="text-xs text-gray-600">
          Restriction reason: {account.accountStatusReason}
          {account.accountStatusBy ? ` · by ${account.accountStatusBy}` : ''}
          {account.accountStatusAt ? ` on ${formatDate(account.accountStatusAt, true)}` : ''}
        </p>
      )}
      {account && data.canRestrict && (
        <div className="flex flex-wrap gap-2">
          {account.accountStatus === 'active' && data.modes.includes('suspended') && (
            <Button variant="secondary" onClick={() => setPending({ action: 'restrict', mode: 'suspended' })}>
              Suspend {noun}
            </Button>
          )}
          {account.accountStatus !== 'blocked' && data.modes.includes('blocked') && (
            <Button variant="danger" onClick={() => setPending({ action: 'restrict', mode: 'blocked' })}>
              Block {noun}
            </Button>
          )}
          {account.accountStatus !== 'active' && (
            <Button onClick={() => setPending({ action: 'lift' })}>Lift restriction</Button>
          )}
        </div>
      )}
      {account && !data.canRestrict && (
        <p className="text-xs text-gray-500">Restricting this account needs support:manage and {data.neededPermission}.</p>
      )}
      {data.accountActions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Account actions from this report</p>
          <ul className="space-y-1 text-sm" data-testid="report-actions">
            {data.accountActions.map((a, index) => (
              <li key={index} className="border-l-2 border-red-200 pl-3">
                <span className="text-gray-900">
                  {a.action === 'restrict' ? 'Restricted' : 'Restriction lifted'}: {a.from} → {a.to} by {a.byName || a.by}
                </span>
                <span className="block text-xs text-gray-500">
                  {formatDate(a.at, true)} · Reason: {a.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === 'lift' ? 'Lift the restriction' : pending?.mode === 'blocked' ? `Block this ${noun}` : `Suspend this ${noun}`}
        message={
          pending?.action === 'lift'
            ? `The ${noun} can sign in and use Mookalaa again. This is recorded on the report and on the account.`
            : `The ${noun} cannot sign in or transact while ${pending?.mode}. This is recorded on the report, which is marked "Action taken", and on the account.`
        }
        confirmLabel={pending?.action === 'lift' ? 'Lift restriction' : pending?.mode === 'blocked' ? 'Block' : 'Suspend'}
        danger={pending?.action !== 'lift'}
        askReason
        reasonRequired
        busy={busy}
        onConfirm={act}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
