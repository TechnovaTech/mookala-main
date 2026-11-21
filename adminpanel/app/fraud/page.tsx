'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'
import AdminShell, { useAdmin } from '@/components/AdminShell'
import { Button, NoticeBar, Spinner, StatCard, api, formatDate, type Notice } from '@/components/ui'
import SignalGroupCard from '@/components/fraud/SignalGroupCard'
import OpenCaseDialog from '@/components/fraud/OpenCaseDialog'
import ThresholdsDialog from '@/components/fraud/ThresholdsDialog'
import type { RiskRun, RiskSignal } from '@/lib/risk'

type RunResponse = RiskRun & { canManage: boolean }

function Overview({
  run,
  loading,
  error,
  notice,
  setNotice,
  reload,
}: {
  run: RunResponse | null
  loading: boolean
  error: string
  notice: Notice
  setNotice: (notice: Notice) => void
  reload: () => void
}) {
  const admin = useAdmin()
  const [caseSignal, setCaseSignal] = useState<RiskSignal | null>(null)

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <NoticeBar
        notice={{
          type: 'info',
          text: 'A signal is a lead for a person to review, not a finding against anyone. Signals are worked out from current data each time the checks run. No account is ever restricted automatically: any action is taken by an admin, on the account’s own page, after review.',
        }}
      />

      {error && <NoticeBar notice={{ type: 'error', text: error }} />}

      {!run ? (
        loading && <Spinner label="Running checks..." />
      ) : (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Signals" value={run.totals.signals} hint={`Checked ${formatDate(run.ranAt, true)}`} tone="gray" />
            <StatCard label="High severity" value={run.totals.high} hint="Review first" tone={run.totals.high ? 'red' : 'gray'} />
            <StatCard label="Medium severity" value={run.totals.medium} hint="Review when possible" tone={run.totals.medium ? 'amber' : 'gray'} />
            <StatCard
              label="Signals with an open case"
              value={run.totals.withOpenCase}
              hint={`${run.totals.signals - run.totals.withOpenCase} not yet reviewed`}
              tone="blue"
            />
          </div>

          {run.groups.map((group) => (
            <SignalGroupCard key={group.key} group={group} canManage={run.canManage} onOpenCase={setCaseSignal} />
          ))}

          <p className="text-xs text-gray-500">
            The checks took {run.durationMs} ms. Each check lists at most 100 signals. Signals are not stored: one disappears when the data behind it no
            longer crosses its threshold. Reviews are kept in <Link href="/fraud/cases" className="text-teal hover:underline">Risk Cases</Link>.
          </p>
        </div>
      )}

      <OpenCaseDialog
        signal={caseSignal}
        defaultAssignee={admin?.email || ''}
        onClose={() => setCaseSignal(null)}
        onOpened={(title) => {
          setCaseSignal(null)
          setNotice({ type: 'success', text: `Case opened: ${title}. It is now listed under Risk Cases.` })
          reload()
        }}
      />
    </>
  )
}

export default function RiskOverviewPage() {
  const [run, setRun] = useState<RunResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [thresholdsOpen, setThresholdsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRun(await api<RunResponse>('/api/admin/fraud/signals'))
    } catch (err: any) {
      setError(err.message || 'The checks could not be run.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AdminShell
      title="Risk Overview"
      subtitle="Signals from account, payment, OTP and refund activity for a person to review"
      actions={
        <>
          <Button variant="secondary" onClick={() => setThresholdsOpen(true)}>
            <SlidersHorizontal size={16} />
            Thresholds
          </Button>
          <Button onClick={load} loading={loading}>
            {!loading && <RefreshCw size={16} />}
            Run checks
          </Button>
        </>
      }
    >
      <Overview run={run} loading={loading} error={error} notice={notice} setNotice={setNotice} reload={load} />
      <ThresholdsDialog
        open={thresholdsOpen}
        onClose={() => setThresholdsOpen(false)}
        onSaved={() => {
          setThresholdsOpen(false)
          setNotice({ type: 'success', text: 'Thresholds saved. The checks were run again with the new values.' })
          load()
        }}
      />
    </AdminShell>
  )
}
