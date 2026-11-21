'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, api, formatMoney, inputClass } from '@/components/ui'
import { FINANCE_SERVICES } from '@/lib/resources/finance'
import { MoneyLines, SectionTitle, SettlementRulesApplied, formatDay, payeeTypeLabel } from './RulesShared'

export interface PayeeOption {
  payeeType: string
  payeeId: string
  payeeName: string | null
  available: number
}

/**
 * Creates a settlement for one payee and period. The admin only chooses the
 * payee and the dates: every amount is worked out on the server from the
 * ledger and shown here before anything is saved.
 */
export default function SettlementCreateDialog({
  open,
  payees,
  initial,
  onClose,
  onCreated,
}: {
  open: boolean
  payees: PayeeOption[]
  initial: PayeeOption | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [payeeKey, setPayeeKey] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [service, setService] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPayeeKey(initial ? `${initial.payeeType}:${initial.payeeId}` : '')
    setFrom('')
    setTo('')
    setService('')
    setNotes('')
    setPreview(null)
    setProblem(null)
    setError('')
  }, [open, initial])

  // The amounts shown always belong to the inputs on screen.
  useEffect(() => {
    setPreview(null)
    setProblem(null)
  }, [payeeKey, from, to, service])

  const body = (extra: Record<string, any>) => {
    const [payeeType, payeeId] = payeeKey.split(':')
    return { payeeType, payeeId, periodFrom: from, periodTo: to, service, notes, ...extra }
  }

  const ready = Boolean(payeeKey && from && to)

  const workOut = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      const data = await api<any>('/api/admin/finance/settlements', { method: 'POST', body: body({ preview: true }) })
      setPreview(data.preview)
      setProblem(data.problem || null)
    } catch (err: any) {
      setError(err.message || 'Could not work out the settlement.')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api<any>('/api/admin/finance/settlements', { method: 'POST', body: body({}) })
      onCreated(data.id)
    } catch (err: any) {
      setError(err.message || 'Could not create the settlement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Create settlement"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} loading={busy && Boolean(preview)} disabled={!preview || Boolean(problem)}>
            Create settlement
          </Button>
        </>
      }
    >
      <form onSubmit={workOut} className="space-y-4">
        <div>
          <label htmlFor="sc-payee" className="block text-sm font-medium text-gray-700 mb-1">
            Payee
          </label>
          <select id="sc-payee" required value={payeeKey} onChange={(e) => setPayeeKey(e.target.value)} className={inputClass}>
            <option value="">Choose a payee</option>
            {payees.map((p) => (
              <option key={`${p.payeeType}:${p.payeeId}`} value={`${p.payeeType}:${p.payeeId}`}>
                {p.payeeName || p.payeeId} ({payeeTypeLabel(p.payeeType)}) · {formatMoney(p.available)} available
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Only payees with entries in the ledger are listed.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="sc-from" className="block text-sm font-medium text-gray-700 mb-1">
              Period from
            </label>
            <input id="sc-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sc-to" className="block text-sm font-medium text-gray-700 mb-1">
              Period to
            </label>
            <input id="sc-to" type="date" required value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="sc-service" className="block text-sm font-medium text-gray-700 mb-1">
              Service
            </label>
            <select id="sc-service" value={service} onChange={(e) => setService(e.target.value)} className={inputClass}>
              <option value="">All services</option>
              {FINANCE_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">Whole days in India time (Asia/Kolkata), by the date each entry was written to the ledger.</p>

        <div>
          <label htmlFor="sc-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea id="sc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>

        <Button type="submit" variant="secondary" loading={busy && !preview} disabled={!ready}>
          Work out amounts from the ledger
        </Button>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {preview && (
          <div className="rounded-lg border border-gray-200 p-4" role="status">
            <SectionTitle>
              {preview.entryCount} ledger {preview.entryCount === 1 ? 'entry' : 'entries'} in this period
            </SectionTitle>
            <MoneyLines
              lines={[
                { label: 'Gross payments', value: preview.grossAmount },
                { label: 'Commission', value: preview.commissionAmount, minus: true },
                { label: 'GST on commission', value: preview.gstAmount, minus: true },
                { label: 'Gateway fees', value: preview.gatewayFeeAmount, minus: true },
                { label: 'Refunds', value: preview.refundsAmount, minus: true },
                { label: 'Net payable', value: preview.netAmount, strong: true },
              ]}
            />
            <ul className="text-xs text-gray-500 mt-3 space-y-1">
              <li>
                Pending balance {formatMoney(preview.pendingBalance)}, of which {formatMoney(preview.inOpenSettlements)} is already in
                open settlements: {formatMoney(preview.availableToSettle)} available to settle.
              </li>
              {preview.alreadySettled > 0 && <li>{preview.alreadySettled} entries in this period are already covered by another settlement and are left out.</li>}
              {preview.heldBackCount > 0 && (
                <li>
                  {preview.heldBackCount} entries (net {formatMoney(preview.heldBackNet)}) are left out because their event is still
                  inside the settlement eligibility wait of their service.
                </li>
              )}
              <li>
                {preview.dueDate
                  ? `Due ${formatDay(preview.dueDate, 'Asia/Kolkata')}${preview.payoutSchedule === 'mixed' ? ' (the earliest due date of the services covered).' : ` (period end plus one ${preview.payoutSchedule} payout cycle).`}`
                  : preview.payoutSchedule === 'manual'
                    ? 'No due date: the payout schedule is manual.'
                    : 'No due date: no payout schedule is set.'}
              </li>
            </ul>
            {preview.rulesApplied?.length > 0 && (
              <div className="mt-3">
                <SectionTitle>Settlement rule applied</SectionTitle>
                <SettlementRulesApplied rules={preview.rulesApplied} timezone="Asia/Kolkata" />
              </div>
            )}
            {problem && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                {problem}
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
}
