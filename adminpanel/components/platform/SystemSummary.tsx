'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { useAdmin, useCan } from '@/components/AdminShell'
import { Button, Spinner, api, formatDate } from '@/components/ui'
import { StatusPill } from '@/components/system/HealthCheckCard'
import type { CheckStatus, HealthReport } from '@/lib/health'

const OVERALL: Record<HealthReport['overall'], { status: CheckStatus; text: string }> = {
  ok: { status: 'ok', text: 'All checks passed' },
  degraded: { status: 'warning', text: 'Some checks need attention' },
  down: { status: 'failed', text: 'The database is not answering' },
}

/**
 * A summary of GET /api/admin/system/health for the platform screen: the
 * overall state and every check that is not "ok". Only for admins who hold
 * system:view; everyone else gets the link alone.
 */
export default function SystemSummary() {
  const admin = useAdmin()
  const canView = useCan('system:view')
  const [report, setReport] = useState<HealthReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await api<HealthReport>('/api/admin/system/health'))
    } catch (e: any) {
      setError(e.message || 'The health checks could not be run.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canView) load()
  }, [canView, load])

  const link = (
    <Link href="/system" className="text-sm text-teal font-medium underline">
      Open system health
    </Link>
  )

  if (!admin) return <Spinner />
  if (!canView) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <p>The detailed system health checks are shown to admins with System Health access.</p>
        {link}
      </div>
    )
  }

  const problems = report ? report.checks.filter((c) => c.status !== 'ok') : []
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm" id="system-overall">
          {report && (
            <>
              <StatusPill status={OVERALL[report.overall].status} />
              <span className="font-medium text-gray-800">{OVERALL[report.overall].text}</span>
              <span className="text-xs text-gray-500">checked {formatDate(report.checkedAt, true)}</span>
            </>
          )}
          {loading && !report && <span className="text-gray-500">Running the health checks...</span>}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Check again
          </Button>
          {link}
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-700 mt-3" role="alert">
          {error}
        </p>
      )}
      {report && problems.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 border border-gray-200 rounded-lg" id="system-problems">
          {problems.map((check) => (
            <li key={check.key} className="px-3 py-2 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
              <StatusPill status={check.status} />
              <span className="font-medium text-gray-800">{check.label}</span>
              <span className="text-gray-600 basis-full sm:basis-auto">{check.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {report && problems.length === 0 && <p className="text-sm text-gray-600 mt-2">Every check reported no problem.</p>}
    </div>
  )
}
