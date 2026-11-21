'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { useAdmin } from '@/components/AdminShell'
import { Button, Card, Modal, NoticeBar, api, formatDate, inputClass, type Notice } from '@/components/ui'
import { normaliseRole } from '@/lib/permissions'

interface BackupRef {
  id: string
  takenAt: string | null
  type: string | null
  scope: string | null
  size: string | null
  takenBy: string | null
  restoreTestedAt: string | null
  reference?: string | null
}

interface Summary {
  lastBackup: BackupRef | null
  lastBackupAgeDays: number | null
  lastRestoreTest: BackupRef | null
  lastRestoreTestAgeDays: number | null
  lastExport: BackupRef | null
  totalRecords: number
  warnings: { level: 'warning' | 'critical'; text: string }[]
  limits: { backupMaxAgeDays: number; restoreTestMaxAgeDays: number }
  isSuperAdmin: boolean
}

interface ExportOptions {
  collections: { name: string; label: string; documents: number }[]
  limits: { text: string }
  removed: string[]
  minReasonLength: number
}

const TYPE_LABEL: Record<string, string> = { atlas_snapshot: 'Atlas snapshot', manual: 'Manual backup', logical_export: 'Logical export' }

function ago(days: number | null): string {
  if (days === null) return ''
  if (days <= 0) return 'today'
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function Fact({ label, primary, secondary, missing }: { label: string; primary: string; secondary?: string; missing?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${missing ? 'text-red-700' : 'text-deep-blue'}`}>{primary}</p>
      {secondary && <p className="text-sm text-gray-500 mt-1 break-words">{secondary}</p>}
    </Card>
  )
}

function ExportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: Notice) => void }) {
  const [options, setOptions] = useState<ExportOptions | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setOptions(null)
    setSelected([])
    setReason('')
    setError('')
    api<ExportOptions>('/api/admin/system/export')
      .then(setOptions)
      .catch((err: any) => setError(err.message || 'The export options could not be loaded.'))
  }, [open])

  const toggle = (name: string) => setSelected((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]))

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      // A file download cannot go through api(), which only reads JSON.
      const response = await fetch('/api/admin/system/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: selected, reason: reason.trim() }),
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || `The export was refused (${response.status}).`)
      }
      const exportId = response.headers.get('X-Export-Id') || 'export'
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mookalaa-export-${exportId}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      onDone({ type: 'success', text: `Export ${exportId} downloaded and recorded in the activity log and in the backup log below (reload the page to see the new row). Store the file somewhere access-controlled and delete it when it is no longer needed.` })
    } catch (err: any) {
      setError(err.message || 'The export failed.')
    } finally {
      setBusy(false)
    }
  }

  const minReason = options?.minReasonLength || 10

  return (
    <Modal
      open={open}
      title="Export data"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy} disabled={selected.length === 0 || reason.trim().length < minReason}>
            {!busy && <Download size={16} />}
            Export {selected.length || ''} collection{selected.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error && (
          <p role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <p className="text-gray-700">
          This downloads a JSON file of the collections you choose. It is an operational export for analysis or hand-over, <strong>not a restorable full backup</strong>:
          indexes, images, credentials and identity documents are left out, so the database cannot be rebuilt from it.
        </p>
        {options && (
          <>
            <fieldset>
              <legend className="font-medium text-gray-700 mb-2">Collections</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {options.collections.map((collection) => (
                  <label key={collection.name} className="flex items-start gap-2 text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(collection.name)}
                      onChange={() => toggle(collection.name)}
                    />
                    <span>
                      {collection.label} <span className="text-gray-500">({collection.documents.toLocaleString('en-IN')})</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="font-medium text-gray-700 mb-1">Always removed from the file</p>
              <ul className="list-disc pl-5 text-gray-600 space-y-0.5">
                {options.removed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-gray-600 mt-2">
                The file still contains personal data such as names, phone numbers and email addresses. {options.limits.text}
              </p>
            </div>
          </>
        )}
        <div>
          <label htmlFor="export-reason" className="block font-medium text-gray-700 mb-1">
            Reason for this export (at least {minReason} characters)
          </label>
          <textarea
            id="export-reason"
            rows={2}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder="Saved in the activity log and the backup log"
          />
        </div>
      </div>
    </Modal>
  )
}

/** Summary, warnings, explanation and export for the Backups page. Rendered above the backup log. */
export default function BackupPanels() {
  const admin = useAdmin()
  const isSuperAdmin = normaliseRole(admin?.role) === 'super_admin'
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const load = useCallback(() => {
    api<Summary>('/api/admin/system/backups/summary')
      .then((data) => {
        setSummary(data)
        setError('')
      })
      .catch((err: any) => setError(err.message || 'The backup summary could not be loaded.'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4 mb-6">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {error && <NoticeBar notice={{ type: 'error', text: error }} />}

      {summary?.warnings.map((warning) => (
        <div
          key={warning.text}
          role="alert"
          className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm ${
            warning.level === 'critical' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{warning.text}</span>
        </div>
      ))}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Fact
            label="Last successful backup (recorded)"
            missing={!summary.lastBackup}
            primary={summary.lastBackup ? `${formatDate(summary.lastBackup.takenAt, true)} (${ago(summary.lastBackupAgeDays)})` : 'None recorded'}
            secondary={
              summary.lastBackup
                ? [TYPE_LABEL[summary.lastBackup.type || ''] || summary.lastBackup.type, summary.lastBackup.scope, summary.lastBackup.size, summary.lastBackup.takenBy && `by ${summary.lastBackup.takenBy}`]
                    .filter(Boolean)
                    .join(' · ')
                : `A warning shows when there is none in ${summary.limits.backupMaxAgeDays} days.`
            }
          />
          <Fact
            label="Last restore test (recorded)"
            missing={!summary.lastRestoreTest}
            primary={summary.lastRestoreTest ? `${formatDate(summary.lastRestoreTest.restoreTestedAt)} (${ago(summary.lastRestoreTestAgeDays)})` : 'None recorded'}
            secondary={
              summary.lastRestoreTest
                ? `Of the backup taken ${formatDate(summary.lastRestoreTest.takenAt, true)}`
                : `A warning shows when there is none in ${summary.limits.restoreTestMaxAgeDays} days.`
            }
          />
          <Fact
            label="Last data export"
            primary={summary.lastExport ? formatDate(summary.lastExport.takenAt, true) : 'None'}
            secondary={summary.lastExport ? [summary.lastExport.takenBy && `by ${summary.lastExport.takenBy}`, summary.lastExport.size].filter(Boolean).join(' · ') : 'Exports are not backups and do not count above.'}
          />
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold text-deep-blue">How backups work here</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700 list-disc pl-5">
          <li>The database is hosted on MongoDB Atlas and this application runs on a serverless host. The application cannot take, schedule or restore a database backup itself.</li>
          <li>Backups are Atlas snapshots. Scheduled backups must be switched on in the Atlas console (cluster &gt; Backup), and they are only available on cluster tiers that include backup. This page cannot tell whether they are on.</li>
          <li>Atlas does not report snapshot status to this application, so the figures above come only from the log below, which the team keeps by hand after checking the Atlas console.</li>
          <li>Restores are done in the Atlas console by someone with Atlas project access. Record each restore test against the backup that was restored.</li>
          <li>The &ldquo;Export data&rdquo; button downloads selected collections as JSON with secrets and identity documents removed. It is an operational export, not a restorable full backup.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isSuperAdmin ? (
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              <Download size={16} />
              Export data
            </Button>
          ) : (
            <p className="text-sm text-gray-500">Exports and changes to the backup log are limited to Super Admins.</p>
          )}
        </div>
      </Card>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onDone={(message) => {
          setExportOpen(false)
          setNotice(message)
          load()
        }}
      />
    </div>
  )
}
