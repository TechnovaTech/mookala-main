'use client'
import React, { useEffect, useState } from 'react'
import { Button, Modal, Spinner, api, formatDate, inputClass } from '@/components/ui'
import type { RiskSettingField, RiskSettings } from '@/lib/risk'

interface SettingsResponse {
  settings: RiskSettings
  defaults: RiskSettings
  fields: RiskSettingField[]
  updatedAt: string | null
  updatedBy: string | null
  canManage: boolean
}

/** Shows the thresholds the detectors use. Admins with fraud:manage can change them. */
export default function ThresholdsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setData(null)
    setError('')
    setReason('')
    api<SettingsResponse>('/api/admin/fraud/settings')
      .then((response) => {
        setData(response)
        setValues(Object.fromEntries(response.fields.map((f) => [f.key, String(response.settings[f.key])])))
      })
      .catch((err: any) => setError(err.message || 'The thresholds could not be loaded.'))
  }, [open])

  const changed = data ? data.fields.filter((f) => values[f.key] !== String(data.settings[f.key])) : []

  const save = async () => {
    if (!data) return
    setSaving(true)
    setError('')
    try {
      await api('/api/admin/fraud/settings', {
        method: 'PUT',
        body: { settings: Object.fromEntries(changed.map((f) => [f.key, values[f.key]])), reason: reason.trim() },
      })
      onSaved()
    } catch (err: any) {
      setError(err.message || 'The thresholds could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const canManage = Boolean(data?.canManage)

  return (
    <Modal
      open={open}
      title="Signal thresholds"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {canManage ? 'Cancel' : 'Close'}
          </Button>
          {canManage && (
            <Button onClick={save} loading={saving} disabled={changed.length === 0}>
              Save thresholds
            </Button>
          )}
        </>
      }
    >
      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
          {error}
        </p>
      )}
      {!data ? (
        !error && <Spinner label="Loading thresholds..." />
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-gray-600">
            A signal is raised when the data crosses one of these numbers. Lower numbers raise more signals.
            {data.updatedAt
              ? ` Last changed ${formatDate(data.updatedAt, true)}${data.updatedBy ? ` by ${data.updatedBy}` : ''}.`
              : ' These are the built-in defaults; nobody has changed them.'}
            {!canManage && ' You can view these but not change them.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`risk-${field.key}`} className="block font-medium text-gray-700 mb-1">
                  {field.label}
                </label>
                <input
                  id={`risk-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  step={1}
                  value={values[field.key] ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  className={inputClass}
                  aria-describedby={`risk-${field.key}-help`}
                />
                <p id={`risk-${field.key}-help`} className="text-xs text-gray-500 mt-1">
                  {field.help} Default {data.defaults[field.key]}; allowed {field.min} to {field.max}.
                </p>
              </div>
            ))}
          </div>
          {canManage && (
            <div>
              <label htmlFor="risk-reason" className="block font-medium text-gray-700 mb-1">
                Reason for the change (optional)
              </label>
              <textarea
                id="risk-reason"
                rows={2}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
                placeholder="Saved in the activity log with the old and new values"
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
