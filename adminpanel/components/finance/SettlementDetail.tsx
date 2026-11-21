'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Badge, Button, Modal, Spinner, api, formatDate, formatMoney } from '@/components/ui'
import { ActionDialog, AuditHistory, MoneyLines, Row, SectionTitle, SettlementRulesApplied, StatusBadge, formatDay, payeeTypeLabel, serviceLabel, type ActionRequest } from './RulesShared'

export const SETTLEMENT_STATUS = [
  { value: 'pending', label: 'Pending', tone: 'blue' as const },
  { value: 'awaiting_second_approval', label: 'Awaiting second approval', tone: 'purple' as const },
  { value: 'approved', label: 'Approved', tone: 'green' as const },
  { value: 'on_hold', label: 'On hold', tone: 'amber' as const },
  { value: 'paid', label: 'Paid', tone: 'green' as const },
  { value: 'failed', label: 'Failed', tone: 'red' as const },
]

const ENTRY_LABEL: Record<string, string> = {
  payment: 'Payment',
  commission: 'Commission',
  gst: 'GST',
  gateway_fee: 'Gateway fee',
  refund: 'Refund',
}

/** One settlement: amounts from the ledger, approvals, covered entries, history and actions. */
export default function SettlementDetail({
  settlementId,
  onClose,
  onChanged,
}: {
  settlementId: string | null
  onClose: () => void
  onChanged: (message: string, closed?: boolean) => void
}) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState<ActionRequest | null>(null)

  const load = useCallback(async () => {
    if (!settlementId) return
    try {
      setData(await api<any>(`/api/admin/finance/settlements/${settlementId}`))
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not open the settlement.')
    }
  }, [settlementId])

  useEffect(() => {
    setData(null)
    setError('')
    if (settlementId) load()
  }, [settlementId, load])

  if (!settlementId) return null

  const s = data?.settlement
  const status: string = s?.status || ''
  const net = formatMoney(s?.netAmount)
  const payee = s?.payeeName || s?.payeeId || 'the payee'

  const send = (name: string, message: string) => async (values: { reason: string; reference: string }) => {
    await api(`/api/admin/finance/settlements/${settlementId}`, {
      method: 'POST',
      body: { action: name, reason: values.reason, bankReference: values.reference },
    })
    onChanged(message)
    await load()
  }

  const actions: React.ReactNode[] = []
  if (s && data.canManage && status !== 'paid') {
    const second = status === 'awaiting_second_approval'
    if (data.canApprove && (status === 'pending' || (second && !data.isFirstApprover))) {
      actions.push(
        <Button
          key="approve"
          onClick={() =>
            setAction({
              title: second ? 'Give the second approval' : 'Approve settlement',
              confirmLabel: second ? 'Give second approval' : 'Approve',
              reason: 'optional',
              message: (
                <>
                  <p>
                    Approve a payout of <strong>{net}</strong> to {payee}?
                  </p>
                  {!second && data.needsSecondApproval && (
                    <p className="mt-2 text-gray-600">
                      This is above the {formatMoney(data.secondApprovalAbove)} threshold, so a different admin must give a second
                      approval before it can be paid.
                    </p>
                  )}
                </>
              ),
              run: send('approve', second ? 'Second approval recorded.' : 'Settlement approved.'),
            })
          }
        >
          {second ? 'Give second approval' : 'Approve'}
        </Button>
      )
    }

    if (status === 'approved') {
      actions.push(
        <Button
          key="paid"
          onClick={() =>
            setAction({
              title: 'Mark as paid',
              confirmLabel: 'Mark as paid',
              reason: 'optional',
              referenceLabel: 'Bank reference of the payout',
              referenceHelp: 'The UTR or transaction reference of the transfer to the payee.',
              message: (
                <p>
                  Record that <strong>{net}</strong> has been paid to {payee}. This writes a settlement entry to the ledger and
                  cannot be undone: a paid settlement cannot be edited or deleted.
                </p>
              ),
              run: send('paid', 'Settlement marked as paid.'),
            })
          }
        >
          Mark as paid
        </Button>
      )
    }

    if (status === 'on_hold') {
      actions.push(
        <Button
          key="release"
          onClick={() =>
            setAction({
              title: 'Release from hold',
              confirmLabel: 'Release',
              reason: 'optional',
              message: <p>The settlement goes back to &quot;Pending&quot; and must be approved again.</p>,
              run: send('release', 'Settlement released from hold.'),
            })
          }
        >
          Release from hold
        </Button>
      )
    }

    if (['pending', 'awaiting_second_approval', 'approved'].includes(status)) {
      actions.push(
        <Button
          key="hold"
          variant="secondary"
          onClick={() =>
            setAction({
              title: 'Put on hold',
              confirmLabel: 'Put on hold',
              reason: 'required',
              message: <p>A settlement on hold cannot be approved or paid until it is released.</p>,
              run: send('hold', 'Settlement put on hold.'),
            })
          }
        >
          Put on hold
        </Button>
      )
    }

    if (['approved', 'on_hold'].includes(status)) {
      actions.push(
        <Button
          key="failed"
          variant="secondary"
          onClick={() =>
            setAction({
              title: 'Mark payout as failed',
              confirmLabel: 'Mark as failed',
              danger: true,
              reason: 'required',
              message: <p>Use this when the transfer could not be made. Nothing is written to the ledger, and the entries become available for a new settlement.</p>,
              run: send('failed', 'Settlement marked as failed.'),
            })
          }
        >
          Mark failed
        </Button>
      )
    }

    actions.push(
      <Button
        key="notes"
        variant="secondary"
        onClick={() =>
          setAction({
            title: 'Change the notes',
            confirmLabel: 'Save notes',
            reason: 'optional',
            referenceLabel: 'Notes',
            message: <p>Only the notes can be changed. The amounts come from the ledger. Current notes: {s.notes || 'none'}.</p>,
            run: async ({ reason, reference }) => {
              await api(`/api/admin/finance/settlements/${settlementId}`, { method: 'PUT', body: { notes: reference, reason } })
              onChanged('Settlement notes saved.')
              await load()
            },
          })
        }
      >
        Edit notes
      </Button>
    )

    actions.push(
      <Button
        key="delete"
        variant="danger"
        onClick={() =>
          setAction({
            title: 'Delete settlement',
            confirmLabel: 'Delete',
            danger: true,
            reason: 'required',
            message: <p>The settlement is removed and its ledger entries become available for a new settlement. The deletion is kept in the activity log.</p>,
            run: async ({ reason }) => {
              await api(`/api/admin/finance/settlements/${settlementId}`, { method: 'DELETE', body: { reason } })
              onChanged('Settlement deleted.', true)
            },
          })
        }
      >
        Delete
      </Button>
    )
  }

  return (
    <>
      <Modal open title="Settlement" onClose={action ? () => undefined : onClose} wide footer={actions.length ? <>{actions}</> : undefined}>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : !s ? (
          <Spinner />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge value={status} options={SETTLEMENT_STATUS} />
                <span className="text-2xl font-bold text-deep-blue">{net}</span>
                <span className="text-sm text-gray-500">
                  to {payee} ({payeeTypeLabel(s.payeeType)})
                </span>
              </div>
              <a
                href={`/api/admin/finance/settlements/${settlementId}?statement=csv`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                <Download size={16} />
                Statement (CSV)
              </a>
            </div>

            {status === 'awaiting_second_approval' && (
              <p className="text-sm text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                First approval by {s.firstApprover}. This payout is above the second-approval threshold
                {s.approvalThreshold != null ? ` (${formatMoney(s.approvalThreshold)})` : ''}, so a different admin with settlement
                approval rights must approve it.
                {data.isFirstApprover ? ' You gave the first approval, so you cannot give the second.' : ''}
              </p>
            )}
            {status === 'paid' && (
              <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                Paid on {formatDate(s.paidAt, true)}, bank reference {s.bankReference}. This settlement is a permanent record and
                cannot be edited or deleted.
              </p>
            )}
            {status === 'on_hold' && s.holdReason && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">On hold: {s.holdReason}</p>
            )}
            {status === 'failed' && s.failureReason && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Payout failed: {s.failureReason}
              </p>
            )}
            {status !== 'paid' && status !== 'failed' && Number(s.netAmount) > Number(data.balance?.pending) && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                The payee&apos;s pending balance is now {formatMoney(data.balance.pending)}, less than this settlement. It cannot be marked
                as paid; mark it failed and create a new one.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <SectionTitle>Amounts, from the ledger</SectionTitle>
                <MoneyLines
                  lines={[
                    { label: 'Gross payments', value: s.grossAmount },
                    { label: 'Commission', value: s.commissionAmount, minus: true },
                    { label: 'GST on commission', value: s.gstAmount, minus: true },
                    { label: 'Gateway fees', value: s.gatewayFeeAmount, minus: true },
                    { label: 'Refunds', value: s.refundsAmount, minus: true },
                    { label: 'Net payable', value: s.netAmount, strong: true },
                  ]}
                />
              </div>
              <div>
                <SectionTitle>Details</SectionTitle>
                <Row label="Period">
                  {formatDay(s.periodFrom, s.periodTimezone)} to {formatDay(s.periodTo, s.periodTimezone)}
                  {s.periodTimezone ? ' (India time)' : ' (UTC days)'}
                </Row>
                <Row label="Service">{serviceLabel(s.service)}</Row>
                <Row label="Due date">{s.dueDate ? formatDay(s.dueDate, s.periodTimezone) : 'none'}</Row>
                <Row label="Created">
                  {formatDate(s.createdAt, true)} by {s.createdBy || '—'}
                </Row>
                <Row label="First approver">{s.firstApprover || '—'}</Row>
                <Row label="Second approver">{s.secondApprover || (data.needsSecondApproval ? 'needed' : 'not needed')}</Row>
                <Row label="Bank reference">{s.bankReference || '—'}</Row>
                {data.payout && (
                  <Row label="Ledger entry of the payout">
                    <span className="font-mono text-xs">{data.payout.reference}</span>
                  </Row>
                )}
                <Row label="Notes">{s.notes || '—'}</Row>
              </div>
            </div>

            <div>
              <SectionTitle>Settlement rule applied</SectionTitle>
              {s.rulesApplied?.length ? (
                <>
                  <SettlementRulesApplied rules={s.rulesApplied} timezone={s.periodTimezone} />
                  <p className="text-xs text-gray-500 mt-2">
                    Copied from the finance settings when this settlement was created. Later changes to the settings do not alter it.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">This settlement was created before the rule applied was recorded on it.</p>
              )}
            </div>

            <div>
              <SectionTitle>
                Ledger entries covered ({data.entryTotal})
                {data.entryTotal > data.entries.length ? `, first ${data.entries.length} shown: download the statement for all` : ''}
              </SectionTitle>
              <div className="overflow-auto max-h-72 border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Booking</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry: any) => (
                      <tr key={entry._id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          <a href={`/finance/ledger?q=${encodeURIComponent(entry.reference)}`} className="text-deep-blue hover:underline">
                            {entry.reference}
                          </a>
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge tone={entry.type === 'payment' ? 'green' : entry.type === 'refund' ? 'red' : 'gray'}>
                            {ENTRY_LABEL[entry.type] || entry.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{entry.bookingId || '—'}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {entry.type === 'payment' ? '' : '− '}
                          {formatMoney(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle>History</SectionTitle>
              <AuditHistory entries={data.history} />
            </div>
          </div>
        )}
      </Modal>

      <ActionDialog request={action} onClose={() => setAction(null)} />
    </>
  )
}
