'use client'
import React from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { Card, formatDate } from '@/components/ui'
import type { CheckStatus, HealthCheck } from '@/lib/health'

export const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'OK',
  warning: 'Needs attention',
  failed: 'Failed',
  unknown: 'No data',
}

const STATUS_PILL: Record<CheckStatus, string> = {
  ok: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-700',
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  failed: 'text-red-700',
  unknown: 'text-gray-500',
}

export function StatusIcon({ status, size = 18 }: { status: CheckStatus; size?: number }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'warning' ? AlertTriangle : status === 'failed' ? XCircle : HelpCircle
  return <Icon size={size} className={`shrink-0 ${STATUS_TEXT[status]}`} aria-hidden="true" />
}

export function StatusPill({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_PILL[status]}`}>
      <StatusIcon status={status} size={13} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** ISO timestamps from the server are shown in the admin's local time. */
function display(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? formatDate(value, true) : value
}

export default function HealthCheckCard({ check, children }: { check: HealthCheck; children?: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-deep-blue">{check.label}</h2>
          <p className="text-sm text-gray-600 mt-0.5">{check.summary}</p>
        </div>
        <StatusPill status={check.status} />
      </div>

      {check.details.length > 0 && (
        <dl className="px-5 py-3 divide-y divide-gray-100 text-sm">
          {check.details.map((detail) => (
            <div key={detail.label} className="py-2 flex items-start justify-between gap-4">
              <dt className="text-gray-500 shrink-0">{detail.label}</dt>
              <dd className={`text-right break-words min-w-0 ${detail.status && detail.status !== 'ok' ? STATUS_TEXT[detail.status] + ' font-medium' : 'text-gray-800'}`}>
                {display(detail.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {children && <div className="px-5 py-3 border-t border-gray-100">{children}</div>}

      {check.note && <p className="px-5 py-3 border-t border-gray-100 text-xs text-gray-500">{check.note}</p>}
    </Card>
  )
}
