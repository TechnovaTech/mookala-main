'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PlugZap, RefreshCw } from 'lucide-react'
import AdminShell from '@/components/AdminShell'
import { Button, Card, EmptyState, NoticeBar, Spinner, api, formatDate } from '@/components/ui'
import HealthCheckCard, { StatusIcon, StatusPill } from '@/components/system/HealthCheckCard'
import type { CheckStatus, HealthCheck, HealthFailure, HealthReport } from '@/lib/health'

type Report = HealthReport & { canManage: boolean }

interface GatewayTest {
  status: CheckStatus
  message: string
  mode: string
  testedAt: string
}

const OVERALL: Record<Report['overall'], { status: CheckStatus; title: string; text: string; box: string }> = {
  ok: { status: 'ok', title: 'All checks passed', text: 'Every check that could be run reported no problem.', box: 'bg-green-50 border-green-200' },
  degraded: { status: 'warning', title: 'Some checks need attention', text: 'The application is running, but at least one check below reported a problem or something not configured.', box: 'bg-amber-50 border-amber-200' },
  down: { status: 'failed', title: 'The database is not answering', text: 'Nothing that needs the database can work until it is reachable again.', box: 'bg-red-50 border-red-200' },
}

function FailureTable({ rows, pathLabel }: { rows: HealthFailure[]; pathLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th scope="col" className="px-5 py-2.5 font-medium">Time</th>
            <th scope="col" className="px-5 py-2.5 font-medium">Source</th>
            <th scope="col" className="px-5 py-2.5 font-medium">What failed</th>
            <th scope="col" className="px-5 py-2.5 font-medium">{pathLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="px-5 py-2.5 whitespace-nowrap text-gray-600">{formatDate(row.at, true)}</td>
              <td className="px-5 py-2.5 whitespace-nowrap text-gray-800">{row.source}</td>
              <td className="px-5 py-2.5 text-gray-800">{row.message}</td>
              <td className="px-5 py-2.5 text-gray-600 break-all">{row.path || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SystemStatusPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [gatewayTest, setGatewayTest] = useState<GatewayTest | null>(null)
  const [testError, setTestError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await api<Report>('/api/admin/system/health'))
    } catch (err: any) {
      setError(err.message || 'The health checks could not be run.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const testGateway = async () => {
    setTesting(true)
    setTestError('')
    try {
      setGatewayTest(await api<GatewayTest>('/api/admin/system/health/gateway-test', { method: 'POST' }))
    } catch (err: any) {
      setTestError(err.message || 'The connection test could not be run.')
    } finally {
      setTesting(false)
    }
  }

  const find = (key: HealthCheck['key']) => report?.checks.find((c) => c.key === key)
  const webhooks = find('payment_webhooks')
  const errors = find('application_errors')
  const overall = report ? OVERALL[report.overall] : null

  return (
    <AdminShell
      title="System Status"
      subtitle="Live checks of the database, configuration, payment gateway, webhooks, SMS provider and recorded errors"
      actions={
        <Button onClick={load} loading={loading}>
          {!loading && <RefreshCw size={16} />}
          Refresh
        </Button>
      }
    >
      {error && <NoticeBar notice={{ type: 'error', text: error }} />}

      {!report || !overall ? (
        loading && <Spinner label="Running health checks..." />
      ) : (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className={`border rounded-xl px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${overall.box}`} role="status">
            <div className="flex items-start gap-3">
              <StatusIcon status={overall.status} size={24} />
              <div>
                <p className="font-semibold text-deep-blue">{overall.title}</p>
                <p className="text-sm text-gray-700">{overall.text}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 shrink-0">
              Checked {formatDate(report.checkedAt, true)} in {report.durationMs} ms
            </p>
          </div>

          <Card>
            <ul className="divide-y divide-gray-100">
              {report.checks.map((check) => (
                <li key={check.key} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{check.label}</p>
                    <p className="text-sm text-gray-500">{check.summary}</p>
                  </div>
                  <StatusPill status={check.status} />
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {report.checks.map((check) => (
              <HealthCheckCard key={check.key} check={check}>
                {check.key === 'payment_gateway' && report.canManage ? (
                  <div className="space-y-2">
                    <Button variant="secondary" onClick={testGateway} loading={testing}>
                      {!testing && <PlugZap size={16} />}
                      Test connection
                    </Button>
                    {testError && <p role="alert" className="text-sm text-red-700">{testError}</p>}
                    {gatewayTest && (
                      <p className="text-sm text-gray-700 flex items-start gap-2" role="status">
                        <StatusIcon status={gatewayTest.status} size={16} />
                        <span>
                          {gatewayTest.message} (tested {formatDate(gatewayTest.testedAt, true)})
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Keys are changed under <Link href="/settings" className="text-teal hover:underline">Finance &gt; Payment Gateway</Link>.
                    </p>
                  </div>
                ) : null}
              </HealthCheckCard>
            ))}
          </div>

          <Card>
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Recent webhook failures</h2>
              <p className="text-sm text-gray-500 mt-0.5">The last 10 gateway deliveries that were rejected for a bad signature or could not be processed.</p>
            </div>
            {webhooks?.failures && webhooks.failures.length > 0 ? (
              <FailureTable rows={webhooks.failures} pathLabel="Event ID" />
            ) : (
              <EmptyState
                title={webhooks?.status === 'ok' || webhooks?.status === 'warning' ? 'No failed deliveries' : 'No webhook deliveries have been received'}
                hint="Razorpay deliveries to /api/payment/webhook are stored as they arrive. Failed ones are listed here."
              />
            )}
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-deep-blue">Recent application errors</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                The last 20 errors recorded by the application. Only errors that a route reports through logServerError() appear here, and most routes do not
                call it yet, so an empty list does not mean nothing failed. The hosting provider&rsquo;s logs remain the complete record.
              </p>
            </div>
            {errors?.failures && errors.failures.length > 0 ? (
              <FailureTable rows={errors.failures} pathLabel="Path" />
            ) : (
              <EmptyState title="No errors have been recorded" hint="Errors appear here once server routes report them through logServerError()." />
            )}
          </Card>

          <p className="text-xs text-gray-500">
            Uptime monitors can poll <code className="bg-gray-100 px-1 rounded">/api/public/health</code>, which answers only whether the application can reach its
            database. Incidents are recorded under <Link href="/system/incidents" className="text-teal hover:underline">Incidents</Link>.
          </p>
        </div>
      )}
    </AdminShell>
  )
}
