'use client'
import React from 'react'
import { Card } from '@/components/ui'
import { FIGURE_DEFINITIONS, REPORT_TIMEZONE_LABEL } from '@/lib/resources/reports'

/**
 * The date range, timezone and status definitions behind every figure, shown
 * on each finance and report screen (requirements section 22).
 */
export default function ReportDefinitions({
  rangeLabel,
  generatedAt,
  counts,
}: {
  rangeLabel?: string
  generatedAt?: string
  /** What the report on screen counts (records and statuses). */
  counts?: string
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-deep-blue">How these figures are defined</h2>
      <p className="text-sm text-gray-600 mt-1">
        {rangeLabel && (
          <>
            Date range: <span className="font-medium text-gray-800">{rangeLabel}</span>.{' '}
          </>
        )}
        Timezone: <span className="font-medium text-gray-800">{REPORT_TIMEZONE_LABEL}</span>.
        {generatedAt && (
          <>
            {' '}
            Generated at{' '}
            <span className="font-medium text-gray-800">
              {new Date(generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })} IST
            </span>
            .
          </>
        )}{' '}
        Every figure is computed from entries in the ledger; nothing is estimated.
      </p>
      {counts && (
        <p className="text-sm text-gray-600 mt-2" data-report-counts>
          <span className="font-medium text-gray-800">What this report counts:</span> {counts}
        </p>
      )}
      <dl className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
        {FIGURE_DEFINITIONS.map((definition) => (
          <div key={definition.term} className="text-sm">
            <dt className="font-medium text-gray-800">{definition.term}</dt>
            <dd className="text-gray-600">{definition.meaning}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
