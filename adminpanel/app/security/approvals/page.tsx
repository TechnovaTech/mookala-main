'use client'
import React, { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { Badge, Button, Card, EmptyState, Modal, NoticeBar, Spinner, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { DataTable, Field, Pager, TemporaryPasswordModal, Th } from '@/components/security/shared'

type Status = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired'

interface Approval {
  id: string
  reference: string
  action: string
  actionLabel: string
  module: string
  needs: string
  entityType: string
  entityId: string | null
  entityLabel: string | null
  summary: { before: any; after: any }
  requestedBy: string
  requestedByName: string | null
  requestedByRole: string | null
  reason: string
  status: Status
  decidedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  executedBy: string | null
  executedAt: string | null
  createdAt: string
  expiresAt: string
  isOwnRequest: boolean
  canDecide: boolean
  canExecute: boolean
}

const TABS: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'executed', label: 'Carried out' },
  { value: 'expired', label: 'Expired' },
]

const TONE: Record<Status, 'amber' | 'green' | 'red' | 'blue' | 'gray'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  executed: 'blue',
  expired: 'gray',
}

function Values({ title, value }: { title: string; value: any }) {
  const empty = value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">{title}</p>
      {empty ? (
        <p className="text-sm text-gray-500">{title === 'Old value' ? 'Nothing: this creates a new record.' : 'Nothing: this removes the record.'}</p>
      ) : (
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  )
}

function ApprovalsBody() {
  const [tab, setTab] = useState<Status>('pending')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ approvals: Approval[]; total: number; limit: number; counts: Record<Status, number> } | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [detail, setDetail] = useState<Approval | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [temporary, setTemporary] = useState<{ email: string; password: string; title: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/security/approvals?status=${tab}&page=${page}`))
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    }
  }, [tab, page])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = useCallback(async (id: string) => {
    try {
      const result = await api<{ approval: Approval }>(`/api/admin/security/approvals?id=${encodeURIComponent(id)}`)
      setDetail(result.approval)
      setDecision(null)
      setReason('')
      setDialogError('')
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message })
    }
  }, [])

  // A link such as /security/approvals?id=... opens that request.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) openDetail(id)
  }, [openDetail])

  const decide = async () => {
    if (!detail || !decision) return
    setBusy(true)
    setDialogError('')
    try {
      const result = await api<{ message: string; approval: Approval }>('/api/admin/security/approvals', {
        method: 'POST',
        body: { action: decision, id: detail.id, reason },
      })
      setNotice({ type: 'success', text: result.message })
      setDetail(result.approval)
      setDecision(null)
      setReason('')
      await load()
    } catch (err: any) {
      setDialogError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const carryOut = async () => {
    if (!detail) return
    setBusy(true)
    setDialogError('')
    try {
      const result = await api<{ message: string; approval: Approval | null; result: any }>('/api/admin/security/approvals', {
        method: 'POST',
        body: { action: 'execute', id: detail.id },
      })
      setNotice({ type: 'success', text: result.message })
      if (result.result?.temporaryPassword) {
        setTemporary({ email: result.result.admin?.email || detail.entityLabel || '', password: result.result.temporaryPassword, title: 'Admin created' })
      }
      setDetail(null)
      await load()
    } catch (err: any) {
      setDialogError(err.message)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <p className="text-sm text-gray-600 mb-4">
        Changes that the security settings send to a second approver wait here for 48 hours. Nothing is changed until a different admin
        approves and the change is carried out. You see the requests you made, the ones you decided, and the ones you are allowed to decide.
      </p>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Approval status">
        {TABS.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => { setTab(item.value); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${tab === item.value ? 'bg-deep-blue text-white border-deep-blue' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            {item.label} ({data?.counts?.[item.value] ?? 0})
          </button>
        ))}
      </div>

      <Card>
        {!data ? (
          <Spinner />
        ) : data.approvals.length === 0 ? (
          <EmptyState
            title={`No ${TABS.find((item) => item.value === tab)?.label.toLowerCase()} requests`}
            hint="A request is created when someone saves a change that the security settings send to a second approver, for example a role change or a commission rule."
          />
        ) : (
          <>
            <DataTable
              head={
                <>
                  <Th>Reference</Th>
                  <Th>Change</Th>
                  <Th>Record</Th>
                  <Th>Requested by</Th>
                  <Th>Reason</Th>
                  <Th>{tab === 'pending' || tab === 'approved' ? 'Expires' : 'Decided'}</Th>
                  <Th right>Actions</Th>
                </>
              }
            >
              {data.approvals.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-gray-800">{row.reference}</span>
                    <span className="block mt-1"><Badge tone={TONE[row.status]}>{row.status === 'executed' ? 'carried out' : row.status}</Badge></span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{row.actionLabel}</td>
                  <td className="px-4 py-3 text-gray-800 max-w-xs truncate" title={row.entityLabel || ''}>{row.entityLabel || row.entityType}</td>
                  <td className="px-4 py-3">
                    <span className="block text-gray-800">{row.requestedByName || row.requestedBy}</span>
                    <span className="block text-xs text-gray-500">{formatDate(row.createdAt, true)}{row.isOwnRequest ? ' · you' : ''}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={row.reason}>{row.reason}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {tab === 'pending' || tab === 'approved' ? formatDate(row.expiresAt, true) : formatDate(row.decidedAt || row.executedAt, true)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => openDetail(row.id)}>
                      {row.canDecide ? 'Review' : row.canExecute ? 'Carry out' : 'View'}
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(detail)}
        wide
        title={detail ? `${detail.reference}: ${detail.actionLabel}` : ''}
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <>
              <Button variant="secondary" onClick={() => setDetail(null)} disabled={busy}>Close</Button>
              {detail.canDecide && !decision && (
                <>
                  <Button variant="danger" onClick={() => { setDecision('reject'); setDialogError('') }}>Reject</Button>
                  <Button onClick={() => { setDecision('approve'); setDialogError('') }}>Approve</Button>
                </>
              )}
              {detail.canDecide && decision && (
                <Button variant={decision === 'reject' ? 'danger' : 'primary'} loading={busy} disabled={reason.trim().length < 5} onClick={decide}>
                  {decision === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
                </Button>
              )}
              {detail.canExecute && (
                <Button onClick={carryOut} loading={busy}>Carry out now</Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <NoticeBar notice={dialogError ? { type: 'error', text: dialogError } : null} />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['Status', detail.status === 'executed' ? 'Carried out' : detail.status[0].toUpperCase() + detail.status.slice(1)],
                ['Change', detail.actionLabel],
                ['Record', `${detail.entityLabel || '—'} (${detail.entityType}${detail.entityId ? ` ${detail.entityId}` : ''})`],
                ['Requested by', `${detail.requestedByName || ''} ${detail.requestedBy}${detail.requestedByRole ? ` · ${detail.requestedByRole}` : ''}`.trim()],
                ['Requested on', formatDate(detail.createdAt, true)],
                ['Expires', formatDate(detail.expiresAt, true)],
                ['Who can approve', detail.needs],
                ['Decision', detail.decidedBy ? `${detail.status === 'rejected' ? 'Rejected' : 'Approved'} by ${detail.decidedBy} on ${formatDate(detail.decidedAt, true)}` : 'Not decided yet'],
                ['Carried out', detail.executedBy ? `${detail.executedBy} on ${formatDate(detail.executedAt, true)}` : 'Not yet'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="text-gray-800 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Reason given by the requester</p>
              <p className="text-gray-800">{detail.reason}</p>
            </div>
            {detail.decisionReason && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Reason for the decision</p>
                <p className="text-gray-800">{detail.decisionReason}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Values title="Old value" value={detail.summary?.before} />
              <Values title="New value" value={detail.summary?.after} />
            </div>
            {detail.isOwnRequest && detail.status === 'pending' && (
              <p className="text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                You asked for this change, so you cannot approve it yourself. It needs: {detail.needs.toLowerCase()}.
              </p>
            )}
            {!detail.isOwnRequest && detail.status === 'pending' && !detail.canDecide && (
              <p className="text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">You may view this request but not decide on it. It needs: {detail.needs.toLowerCase()}.</p>
            )}
            {detail.canExecute && (
              <p className="text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Approved. &ldquo;Carry out now&rdquo; makes exactly this change with your own sign-in: every check of the original screen runs again, and
                the approval is used up. You can also save the same change again from its own screen.
              </p>
            )}
            {detail.canDecide && decision && (
              <Field label={decision === 'approve' ? 'Why you approve this change' : 'Why you reject this change'} htmlFor="approval-reason" hint="At least 5 characters. Saved with the decision and in the activity log.">
                <textarea id="approval-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
              </Field>
            )}
          </div>
        )}
      </Modal>

      <TemporaryPasswordModal info={temporary} onClose={() => setTemporary(null)} />
    </>
  )
}

export default function ApprovalsPage() {
  return (
    <AdminShell title="Approvals" subtitle="Sensitive changes waiting for, or decided by, a second approver">
      <ApprovalsBody />
    </AdminShell>
  )
}
