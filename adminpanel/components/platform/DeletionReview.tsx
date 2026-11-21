'use client'
import React, { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { Badge, Button, Card, NoticeBar, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { RecordSelect, useRecords } from '@/components/platform/RecordSelect'

export interface DeletionPanelState {
  selected: string
  impact: any | null
  outcome: string
  notice: Notice
}

export const EMPTY_DELETION_PANEL: DeletionPanelState = { selected: '', impact: null, outcome: '', notice: null }

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
}

const TREATMENT: Record<string, { label: string; tone: 'red' | 'amber' | 'gray' }> = {
  erase: { label: 'To delete or anonymise', tone: 'red' },
  review: { label: 'Review case by case', tone: 'amber' },
  keep: { label: 'Kept', tone: 'gray' },
}

/**
 * Shows which records hold a requester's data and records what the admin did
 * about them. This panel never deletes anything.
 */
export default function DeletionReview({
  state,
  onState,
  onChanged,
}: {
  state: DeletionPanelState
  onState: (next: DeletionPanelState) => void
  onChanged: () => void
}) {
  const { records, loading, reload } = useRecords('deletion-requests')
  const [busy, setBusy] = useState(false)

  const review = async (id = state.selected, notice: Notice = null) => {
    if (!id) return
    setBusy(true)
    try {
      const data = await api<any>(`/api/admin/legal/deletion-requests/${id}/impact`)
      onState({ selected: id, impact: data, outcome: data.request.outcome || '', notice })
    } catch (e: any) {
      onState({ ...state, impact: null, notice: { type: 'error', text: e.message || 'Could not work out the affected records.' } })
    } finally {
      setBusy(false)
    }
  }

  const save = async (markCompleted: boolean) => {
    setBusy(true)
    try {
      await api(`/api/admin/legal/deletion-requests/${state.selected}/outcome`, {
        method: 'POST',
        body: { outcome: state.outcome, markCompleted },
      })
      await reload()
      await review(state.selected, {
        type: 'success',
        text: markCompleted ? 'Outcome recorded and the request is marked Completed.' : 'Outcome recorded.',
      })
      onChanged()
    } catch (e: any) {
      onState({ ...state, notice: { type: 'error', text: e.message || 'Could not record the outcome.' } })
    } finally {
      setBusy(false)
    }
  }

  const impact = state.impact
  const canRecord = impact && impact.canManage && impact.request.status === 'approved' && !impact.request.legalHold

  return (
    <Card className="p-5 mb-4">
      <h2 className="text-base font-semibold text-deep-blue">Review affected records</h2>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        Approving or completing a request deletes nothing. This review shows where the person&rsquo;s data is held so an admin can
        remove or anonymise it by hand in the relevant screens, then record here what was done. Bookings, refunds, settlements and
        ledger entries are financial records and are kept.
      </p>
      <NoticeBar notice={state.notice} onClose={() => onState({ ...state, notice: null })} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <RecordSelect
          id="deletion-request-pick"
          label="Deletion request"
          records={records}
          value={state.selected}
          onChange={(id) => onState({ ...EMPTY_DELETION_PANEL, selected: id })}
          onReload={reload}
          loading={loading}
          describe={(r) => `${r.requesterName} · ${r.requesterPhone} (${STATUS_LABELS[r.status] || r.status})`}
          emptyText="No deletion requests yet"
        />
        <Button variant="secondary" onClick={() => review()} disabled={!state.selected} loading={busy}>
          <ListChecks size={16} />
          Review affected records
        </Button>
      </div>

      {impact && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-gray-700">
            Records matching <strong>{impact.request.requesterPhone}</strong> (checked as {impact.phoneFormsChecked.join(', ')}). Request
            status: <strong>{STATUS_LABELS[impact.request.status] || impact.request.status}</strong>
            {impact.request.legalHold ? ' · under legal hold' : ''}.
          </p>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-4 py-2 font-medium">Records</th>
                  <th scope="col" className="px-4 py-2 font-medium">Collection</th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">Count</th>
                  <th scope="col" className="px-4 py-2 font-medium">Treatment</th>
                  <th scope="col" className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {impact.rows.map((row: any) => (
                  <tr key={row.collection + row.matchedOn} className={row.count === 0 ? 'text-gray-400' : 'text-gray-800'}>
                    <td className="px-4 py-2">{row.label}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.collection}</td>
                    <td className="px-4 py-2 text-right font-semibold">{row.count}</td>
                    <td className="px-4 py-2">
                      <Badge tone={TREATMENT[row.treatment]?.tone || 'gray'}>{TREATMENT[row.treatment]?.label || row.treatment}</Badge>
                    </td>
                    <td className="px-4 py-2">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {impact.request.legalHold && (
            <NoticeBar notice={{ type: 'info', text: 'This request is under legal hold: the data must be kept and no outcome can be recorded until the hold is removed.' }} />
          )}

          {impact.request.outcomeRecordedAt && (
            <p className="text-sm text-gray-600">
              Outcome last recorded {formatDate(impact.request.outcomeRecordedAt, true)}
              {impact.request.outcomeRecordedBy ? ` by ${impact.request.outcomeRecordedBy}` : ''}.
            </p>
          )}

          {canRecord ? (
            <div>
              <label htmlFor="deletion-outcome" className="block text-sm font-medium text-gray-700 mb-1">
                What was done with these records
              </label>
              <textarea
                id="deletion-outcome"
                rows={4}
                value={state.outcome}
                onChange={(e) => onState({ ...state, outcome: e.target.value })}
                className={inputClass}
                placeholder="State which records were deleted or anonymised, by whom and when, and which were kept and why."
              />
              <p className="text-xs text-gray-500 mt-1">
                Saved on the request with the record counts above and written to the activity log. It does not change any of the records.
              </p>
              <div className="flex flex-wrap justify-end gap-2 mt-3">
                <Button variant="secondary" onClick={() => save(false)} disabled={state.outcome.trim().length < 10} loading={busy}>
                  Save outcome
                </Button>
                <Button onClick={() => save(true)} disabled={state.outcome.trim().length < 10} loading={busy}>
                  Save outcome and mark completed
                </Button>
              </div>
            </div>
          ) : (
            impact.request.outcome && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Recorded outcome</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{impact.request.outcome}</p>
              </div>
            )
          )}
          {!canRecord && impact.canManage && impact.request.status !== 'approved' && impact.request.status !== 'completed' && (
            <p className="text-sm text-gray-600">An outcome can be recorded once the request has been approved.</p>
          )}
        </div>
      )}
    </Card>
  )
}
