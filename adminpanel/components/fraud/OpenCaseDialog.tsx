'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, api, inputClass } from '@/components/ui'
import type { RiskSignal } from '@/lib/risk'

/** Opens a risk case from a signal. The server copies the evidence from the detector itself. */
export default function OpenCaseDialog({
  signal,
  defaultAssignee,
  onClose,
  onOpened,
}: {
  signal: RiskSignal | null
  defaultAssignee: string
  onClose: () => void
  onOpened: (title: string) => void
}) {
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!signal) return
    setTitle(`${signal.title}: ${signal.subjectLabel}`.slice(0, 200))
    setAssignedTo(defaultAssignee)
    setNote('')
    setError('')
  }, [signal, defaultAssignee])

  const submit = async () => {
    if (!signal) return
    setSaving(true)
    setError('')
    try {
      await api('/api/admin/fraud/cases', {
        method: 'POST',
        body: { signalKey: signal.key, title: title.trim(), assignedTo: assignedTo.trim(), note: note.trim() },
      })
      onOpened(title.trim())
    } catch (err: any) {
      setError(err.message || 'The case could not be opened.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(signal)}
      title="Open a risk case"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!title.trim()}>
            Open case
          </Button>
        </>
      }
    >
      {signal && (
        <div className="space-y-4 text-sm">
          {error && (
            <p role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <p className="text-gray-600">
            A case records a review of this signal. Opening it does not restrict the account or change any booking or payment.
          </p>
          <div>
            <label htmlFor="case-title" className="block font-medium text-gray-700 mb-1">
              Title
            </label>
            <input id="case-title" type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">Evidence copied to the case</p>
            <p className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700">{signal.evidence}</p>
          </div>
          <div>
            <label htmlFor="case-assignee" className="block font-medium text-gray-700 mb-1">
              Assigned to (admin email, optional)
            </label>
            <input id="case-assignee" type="email" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="case-note" className="block font-medium text-gray-700 mb-1">
              First evidence note (optional)
            </label>
            <textarea id="case-note" rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}
    </Modal>
  )
}
