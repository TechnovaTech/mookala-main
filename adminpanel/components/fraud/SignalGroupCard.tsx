'use client'
import React from 'react'
import Link from 'next/link'
import { ExternalLink, FolderPlus } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import type { Tone } from '@/lib/resource-types'
import type { RiskGroupResult, RiskSignal, SignalSeverity } from '@/lib/risk'

export const SEVERITY_TONE: Record<SignalSeverity, Tone> = { high: 'red', medium: 'amber', low: 'gray' }
export const SEVERITY_LABEL: Record<SignalSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low' }

const CASE_STATUS_LABEL: Record<string, string> = {
  open: 'open',
  under_review: 'under review',
  escalated: 'escalated',
}

function SignalRow({ signal, canManage, onOpenCase }: { signal: RiskSignal; canManage: boolean; onOpenCase: (signal: RiskSignal) => void }) {
  const accounts = signal.related && signal.related.length > 0 ? signal.related : null

  return (
    <li className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[signal.severity]}>{SEVERITY_LABEL[signal.severity]} signal</Badge>
          <span className="text-sm font-medium text-deep-blue">{signal.title}</span>
          {signal.openCase && <Badge tone="blue">Case {CASE_STATUS_LABEL[signal.openCase.status] || signal.openCase.status}</Badge>}
        </div>
        <p className="text-sm text-gray-700">{signal.evidence}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {accounts ? (
            accounts.map((account) =>
              account.href ? (
                <Link key={account.type + account.id} href={account.href} className="inline-flex items-center gap-1 text-teal hover:underline">
                  {account.label}
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
              ) : (
                <span key={account.type + account.id} className="text-gray-600">{account.label}</span>
              )
            )
          ) : signal.href ? (
            <Link href={signal.href} className="inline-flex items-center gap-1 text-teal hover:underline">
              {signal.subjectLabel}
              <ExternalLink size={13} aria-hidden="true" />
            </Link>
          ) : (
            <span className="text-gray-600">{signal.subjectLabel}</span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {signal.openCase ? (
          <Link
            href="/fraud/cases"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            View cases
          </Link>
        ) : canManage ? (
          <Button variant="secondary" onClick={() => onOpenCase(signal)}>
            <FolderPlus size={16} />
            Open a case
          </Button>
        ) : null}
      </div>
    </li>
  )
}

export default function SignalGroupCard({
  group,
  canManage,
  onOpenCase,
}: {
  group: RiskGroupResult
  canManage: boolean
  onOpenCase: (signal: RiskSignal) => void
}) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-deep-blue">{group.label}</h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{group.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {group.signals.length === 0 ? (
            <Badge tone="gray">No signals</Badge>
          ) : (
            <>
              <Badge tone="blue">
                {group.signals.length} signal{group.signals.length === 1 ? '' : 's'}
              </Badge>
              {group.counts.high > 0 && <Badge tone="red">{group.counts.high} high</Badge>}
              {group.counts.medium > 0 && <Badge tone="amber">{group.counts.medium} medium</Badge>}
              {group.counts.low > 0 && <Badge tone="gray">{group.counts.low} low</Badge>}
            </>
          )}
        </div>
      </div>

      {group.notes.map((note) => (
        <p key={note} className="px-5 py-3 text-sm text-amber-800 bg-amber-50 border-b border-amber-100">
          {note}
        </p>
      ))}

      {group.signals.length === 0 ? (
        group.notes.length === 0 && (
          <p className="px-5 py-6 text-sm text-gray-500">Nothing in the current data crosses the thresholds for this check.</p>
        )
      ) : (
        <ul className="divide-y divide-gray-100">
          {group.signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} canManage={canManage} onOpenCase={onOpenCase} />
          ))}
        </ul>
      )}
    </Card>
  )
}
