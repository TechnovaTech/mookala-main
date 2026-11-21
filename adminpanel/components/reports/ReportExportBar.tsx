'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Download, Save } from 'lucide-react'
import { Button, NoticeBar, api, inputClass, type Notice } from '@/components/ui'
import { EXPORT_FORMATS } from '@/lib/resources/reports'
import { downloadFile, formatBytes } from './download'

/**
 * Export controls for the report on screen: download it now as Excel, PDF or
 * CSV, or generate a file that is kept under Generated Files.
 *
 * `query` is the report and date range, e.g. "type=gst&preset=month".
 */
export default function ReportExportBar({ query, disabled = false }: { query: string; disabled?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [saveFormat, setSaveFormat] = useState('xlsx')
  const [notice, setNotice] = useState<Notice>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const download = async (format: string) => {
    setBusy(format)
    setSavedId(null)
    try {
      const file = await downloadFile(`/api/admin/reports?format=${format}&${query}`)
      setNotice({ type: 'success', text: `Downloaded ${file.filename} (${formatBytes(file.size)}). The export was recorded in the activity log.` })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The export failed.' })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setSavedId(null)
    try {
      const params = Object.fromEntries(new URLSearchParams(query).entries())
      const data = await api<{ file: { _id: string; name: string; size: number; expiresAt: string } }>('/api/admin/reports/files', {
        method: 'POST',
        body: { ...params, format: saveFormat },
      })
      setSavedId(data.file._id)
      setNotice({
        type: 'success',
        text: `Saved ${data.file.name} (${formatBytes(data.file.size)}) to Generated Files. It is kept until ${new Date(data.file.expiresAt).toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })} and can be downloaded by admins who have access to this report.`,
      })
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'The file could not be generated.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Download this report">
          {EXPORT_FORMATS.map((format) => (
            <Button
              key={format.value}
              variant="secondary"
              onClick={() => download(format.value)}
              loading={busy === format.value}
              disabled={disabled || busy !== null}
              data-export={format.value}
            >
              {busy !== format.value && <Download size={16} />}
              {format.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2 sm:ml-auto">
          <div>
            <label htmlFor="save-format" className="block text-xs font-medium text-gray-600 mb-1">
              Keep a copy in Generated Files as
            </label>
            <select id="save-format" value={saveFormat} onChange={(e) => setSaveFormat(e.target.value)} className={inputClass} disabled={disabled || busy !== null}>
              {EXPORT_FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={save} loading={busy === 'save'} disabled={disabled || busy !== null} data-export="save">
            {busy !== 'save' && <Save size={16} />}
            Generate and save
          </Button>
        </div>
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {savedId && (
        <p className="text-sm">
          <Link href="/reports/files" className="text-teal font-medium hover:underline">
            Open Generated Files
          </Link>
        </p>
      )}
    </div>
  )
}
