'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { useAdmin } from '@/components/AdminShell'
import { Badge, Button, Card, NoticeBar, api, type Notice } from '@/components/ui'
import { can } from '@/lib/permissions'
import { REPORT_CATALOG, SCHEDULE_FREQUENCIES } from '@/lib/resources/reports'
import { FORMAT_LABELS, downloadFile, formatBytes, istTime } from '@/components/reports/download'

interface Schedule {
  _id: string
  name: string
  reportType: string
  frequency: string
  format?: string
  status: string
  lastRunAt?: string | null
  lastRunBy?: string | null
  lastRunPeriod?: string | null
  lastRunStatus?: string | null
  lastRunError?: string | null
  nextRunAt?: string | null
}

interface RunResult {
  file: { _id: string; name: string; format: string; size: number }
  rows: number
  rangeLabel: string
  downloadUrl: string
}

/**
 * The saved schedules with their last and next run, and "Run now": generates
 * the report for the last completed period with the same code the hourly
 * scheduler uses, saves the file under Generated Files and downloads it.
 */
export default function ReportRunNow() {
  const admin = useAdmin()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Schedule[] }>('/api/admin/r/scheduled-reports?limit=100&sort=name&dir=asc')
      setSchedules(data.items)
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not load the schedules.' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (schedule: Schedule) => {
    setRunning(schedule._id)
    try {
      const result = await api<RunResult>(`/api/admin/reports/scheduled/${schedule._id}/run`, { method: 'POST' })
      let downloaded = true
      try {
        await downloadFile(result.downloadUrl)
      } catch {
        downloaded = false
      }
      setNotice({
        type: 'success',
        text: `"${schedule.name}" was generated for ${result.rangeLabel} (${result.rows} rows, ${FORMAT_LABELS[result.file.format] || result.file.format}, ${formatBytes(result.file.size)}), saved to Generated Files${
          downloaded ? ' and downloaded' : '. The download did not start: open Generated Files to download it'
        }. It was not emailed to the recipients.`,
      })
      await load()
    } catch (error: any) {
      setNotice({ type: 'error', text: error.message || 'Could not run the report.' })
      await load()
    } finally {
      setRunning(null)
    }
  }

  if (schedules.length === 0 && !notice) return null

  return (
    <Card className="mb-4 p-4">
      <h2 className="text-sm font-semibold text-deep-blue mb-1">Runs</h2>
      <p className="text-sm text-gray-600 mb-3">
        Active schedules run by themselves once their period completes (Asia/Kolkata); the scheduler checks once an hour. &quot;Run now&quot; generates the report for
        the last completed period straight away. Either way the file is saved under{' '}
        <Link href="/reports/files" className="text-teal font-medium hover:underline">
          Generated Files
        </Link>
        . Reload the page to see a schedule you have just added.
      </p>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <ul className="divide-y divide-gray-100">
        {schedules.map((schedule) => {
          const info = REPORT_CATALOG.find((item) => item.key === schedule.reportType)
          const allowed = Boolean(info) && info!.permissions.every((permission) => can(admin, permission))
          const failed = schedule.lastRunStatus === 'Failed'
          return (
            <li key={schedule._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-schedule={schedule._id}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {schedule.name} {schedule.status === 'paused' && <Badge tone="gray">Paused</Badge>} {failed && <Badge tone="red">Last run failed</Badge>}
                </p>
                <p className="text-xs text-gray-500">
                  {info?.label || 'Unknown report'} · {SCHEDULE_FREQUENCIES.find((f) => f.value === schedule.frequency)?.label || schedule.frequency} ·{' '}
                  {FORMAT_LABELS[schedule.format || 'csv'] || schedule.format}
                </p>
                <p className="text-xs text-gray-500">
                  Last run:{' '}
                  {schedule.lastRunAt
                    ? `${istTime(schedule.lastRunAt)}${schedule.lastRunPeriod ? ` for ${schedule.lastRunPeriod}` : ''}${
                        schedule.lastRunBy ? ` by ${schedule.lastRunBy === 'schedule' ? 'the scheduler' : schedule.lastRunBy}` : ''
                      }`
                    : 'never'}
                  {' · '}
                  {schedule.status === 'paused'
                    ? 'Paused: the scheduler skips it'
                    : `Next automatic run: ${schedule.nextRunAt ? 'after ' + istTime(schedule.nextRunAt) : 'at the next hourly check'}`}
                </p>
                {failed && schedule.lastRunError && <p className="text-xs text-red-700">{schedule.lastRunError}</p>}
              </div>
              <Button variant="secondary" onClick={() => run(schedule)} loading={running === schedule._id} disabled={!allowed || running !== null}>
                {running !== schedule._id && <Play size={14} />}
                {allowed ? 'Run now' : 'No access to this report'}
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
