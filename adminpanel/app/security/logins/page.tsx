'use client'
import React, { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, ConfirmDialog, EmptyState, NoticeBar, Spinner, StatCard, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, ExportLink, Field, Pager, Th } from '@/components/security/shared'

interface LoginRow {
  id: string
  email: string
  success: boolean
  reasonLabel: string
  ip: string
  device: string
  userAgent: string
  newDevice: boolean
  lockCleared: boolean
  createdAt: string
}

interface Summary {
  failed24h: number
  failedAccounts24h: number
  lockRule: { failures: number; minutes: number }
  locked: { email: string; failures: number; lastFailureAt: string; unlocksAt: string }[]
}

const EMPTY = { email: '', result: '', from: '', to: '' }

function LoginsBody() {
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ logins: LoginRow[]; total: number; limit: number; summary: Summary; canUnlock: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice>(null)
  const [unlock, setUnlock] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value) params.set(key, value)
      return params.toString()
    },
    [filters]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api('/api/admin/security/logins?' + query({ page: String(page) })))
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }, [query, page])

  useEffect(() => {
    load()
  }, [load])

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setFilters(draft)
  }

  const doUnlock = async (reason: string) => {
    if (!unlock) return
    setBusy(true)
    try {
      const result = await api<{ message: string }>('/api/admin/security/logins', { method: 'POST', body: { action: 'unlock', email: unlock, reason } })
      setNotice({ type: 'success', text: result.message })
      await load()
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
      setUnlock(null)
    }
  }

  const summary = data?.summary

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Failed attempts, last 24 hours"
            value={summary.failed24h.toLocaleString('en-IN')}
            hint={summary.failed24h ? `Across ${summary.failedAccounts24h} email${summary.failedAccounts24h === 1 ? '' : 's'}` : undefined}
            tone={summary.failed24h ? 'amber' : 'green'}
          />
          <StatCard label="Accounts locked right now" value={summary.locked.length} tone={summary.locked.length ? 'red' : 'green'} hint={summary.locked.length ? 'See below' : undefined} />
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Lock rule</p>
            <p className="text-sm text-gray-700 mt-2">
              {summary.lockRule.failures} failed attempts within {summary.lockRule.minutes} minutes lock an email for {summary.lockRule.minutes} minutes.
            </p>
          </Card>
        </div>
      )}

      {summary && summary.locked.length > 0 && (
        <Card className="mb-6">
          <h2 className="text-sm font-semibold text-deep-blue px-5 pt-4 pb-2">Locked accounts</h2>
          <DataTable
            head={
              <>
                <Th>Email</Th>
                <Th>Failed attempts counted</Th>
                <Th>Last failure</Th>
                <Th>Unlocks by itself at</Th>
                <Th right>Action</Th>
              </>
            }
          >
            {summary.locked.map((row) => (
              <tr key={row.email}>
                <td className="px-4 py-3 text-gray-800">{row.email}</td>
                <td className="px-4 py-3 text-gray-800">{row.failures}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(row.lastFailureAt, true)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(row.unlocksAt, true)}</td>
                <td className="px-4 py-3 text-right">
                  {data?.canUnlock ? (
                    <Button variant="secondary" onClick={() => setUnlock(row.email)}>
                      Unlock
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">Super Admin only</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Admin email" htmlFor="login-email">
              <input id="login-email" type="search" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputClass} placeholder="Any" />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Result" htmlFor="login-result">
              <select id="login-result" value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} className={inputClass}>
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </Field>
          </div>
          <div>
            <Field label="From" htmlFor="login-from">
              <input id="login-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div>
            <Field label="To" htmlFor="login-to">
              <input id="login-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY)
              setFilters(EMPTY)
              setPage(1)
            }}
          >
            Clear
          </Button>
          <div className="ml-auto">
            <ExportLink href={'/api/admin/security/logins?' + query({ format: 'csv' })} />
          </div>
        </form>
        <p className="text-xs text-gray-500 mt-2">Dates use India Standard Time (Asia/Kolkata).</p>
      </Card>

      <Card>
        {!data && loading ? (
          <Spinner />
        ) : !data || data.logins.length === 0 ? (
          <EmptyState title="No sign-in attempts match" hint="Every admin sign-in attempt, successful or not, is recorded here." />
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>Time</Th>
                  <Th>Email</Th>
                  <Th>Result</Th>
                  <Th>Reason</Th>
                  <Th>IP address</Th>
                  <Th>Device</Th>
                </>
              }
            >
              {data.logins.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(row.createdAt, true)}</td>
                  <td className="px-4 py-3 text-gray-800">{row.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.success ? 'green' : 'red'}>{row.success ? 'Success' : 'Failure'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {row.success ? '—' : row.reasonLabel}
                    {row.lockCleared && <span className="block text-xs text-gray-500">Cleared from the lock count by an unlock</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{row.ip}</td>
                  <td className="px-4 py-3 text-gray-800" title={row.userAgent}>
                    {row.device} {row.newDevice && <Badge tone="amber">New device or location</Badge>}
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(unlock)}
        title="Unlock this account?"
        message={<>{unlock} will be able to try signing in again straight away. The failed attempts stay in the history.</>}
        confirmLabel="Unlock"
        askReason
        reasonRequired
        busy={busy}
        onConfirm={doUnlock}
        onClose={() => setUnlock(null)}
      />
    </>
  )
}

export default function LoginsPage() {
  return (
    <AdminShell title="Login History" subtitle="Every admin sign-in attempt, with the device and the reason for failures">
      <LoginsBody />
    </AdminShell>
  )
}
