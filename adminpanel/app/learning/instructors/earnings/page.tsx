'use client'
import React from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Badge, NoticeBar, Spinner, formatDate, formatMoney } from '@/components/ui'
import { DateRangeBar, ExportLink, ReportTable, formatCount, rangeQuery, useReport, type Column } from '@/components/learning/ReportKit'
import type { Tone } from '@/lib/resource-types'

interface Row {
  instructorId: string
  name: string
  status: string
  courses: number
  enrolments: number
  amountCollected: number
  refundedEnrolments: number
  refundedAmount: number
  netCollected: number
  commission: number | null
  gst: number | null
  gatewayFee: number | null
  netAfterCharges: number | null
  settlements: number
  settledPaid: number
  settledAwaiting: number
}

interface Rule {
  id: string
  text: string
  effectiveFrom: string
}

interface Statement {
  instructors: Row[]
  rule: Rule | null
  canSeeSettlements: boolean
  /** False for an admin who may not view Finance: the rule and the calculated charges are not sent. */
  canSeeCharges: boolean
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  suspended: { label: 'Suspended', tone: 'gray' },
}

const API = '/api/admin/learning/instructor-earnings'

/** A calculated amount, or a plain statement that there is no rule to calculate with. */
function calculated(value: number | null) {
  return value === null ? <span className="text-gray-500">No rule</span> : formatMoney(value)
}

export default function Page() {
  const report = useReport<Statement>(API)
  const rows = report.data?.instructors || null
  const rule = report.data?.rule || null
  const canSeeSettlements = Boolean(report.data?.canSeeSettlements)
  const canSeeCharges = report.data?.canSeeCharges !== false

  const columns: Column<Row>[] = [
    {
      key: 'name',
      label: 'Instructor',
      render: (row) => (
        <Link href={`/learning/courses?f_instructor=${row.instructorId}`} className="text-teal underline whitespace-nowrap" title="Open this instructor's courses">
          {row.name}
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge tone={STATUS[row.status]?.tone || 'gray'}>{STATUS[row.status]?.label || row.status || '—'}</Badge>,
    },
    { key: 'courses', label: 'Courses', align: 'right', render: (row) => formatCount(row.courses) },
    { key: 'enrolments', label: 'Enrolments', align: 'right', render: (row) => formatCount(row.enrolments) },
    { key: 'amountCollected', label: 'Collected', align: 'right', render: (row) => formatMoney(row.amountCollected) },
    {
      key: 'refundedAmount',
      label: 'Refunded',
      align: 'right',
      render: (row) => (row.refundedEnrolments ? `${formatMoney(row.refundedAmount)} (${row.refundedEnrolments})` : '—'),
    },
    { key: 'netCollected', label: 'Collected less refunded', align: 'right', render: (row) => formatMoney(row.netCollected) },
    ...(canSeeCharges
      ? ([
          { key: 'commission', label: 'Commission (calc.)', align: 'right', render: (row) => calculated(row.commission) },
          { key: 'gst', label: 'GST (calc.)', align: 'right', render: (row) => calculated(row.gst) },
          { key: 'gatewayFee', label: 'Gateway fee (calc.)', align: 'right', render: (row) => calculated(row.gatewayFee) },
          { key: 'netAfterCharges', label: 'Net after charges (calc.)', align: 'right', render: (row) => calculated(row.netAfterCharges) },
        ] as Column<Row>[])
      : []),
    ...(canSeeSettlements
      ? ([
          { key: 'settlements', label: 'Settlements', align: 'right', render: (row) => formatCount(row.settlements) },
          { key: 'settledPaid', label: 'Paid out (net)', align: 'right', render: (row) => formatMoney(row.settledPaid) },
          { key: 'settledAwaiting', label: 'Not yet paid (net)', align: 'right', render: (row) => formatMoney(row.settledAwaiting) },
        ] as Column<Row>[])
      : []),
    {
      key: 'statement',
      label: 'Statement',
      render: (row) =>
        row.enrolments > 0 ? (
          <ExportLink href={API + rangeQuery(report.range, { instructor: row.instructorId, export: 'csv' })} label="Lines CSV" />
        ) : (
          '—'
        ),
    },
  ]

  return (
    <AdminShell
      title="Instructor Earnings"
      subtitle="Earnings statement for each instructor, worked out from enrolments"
      actions={
        <>
          <Link
            href="/learning/instructors"
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            Back to instructors
          </Link>
          {rows && rows.length > 0 && <ExportLink href={API + rangeQuery(report.range, { export: 'csv' })} />}
        </>
      }
    >
      {report.error && <NoticeBar notice={{ type: 'error', text: report.error }} />}

      <DateRangeBar
        idPrefix="instructor-earnings"
        draft={report.draft}
        onChange={report.setDraft}
        onApply={report.apply}
        onClear={report.clear}
        note='The range selects enrolments by their "Enrolled on" date. Settlement columns are not limited by the range.'
      />

      {report.data && !canSeeCharges && (
        <div className="border rounded-xl px-4 py-3 mb-4 text-sm bg-gray-50 border-gray-200 text-gray-700" role="status" id="learning-commission-rule">
          The commission rule and the calculated commission, GST and gateway fee are shown to admins who can view Finance.
        </div>
      )}

      {report.data && canSeeCharges && (
        <div
          className={`border rounded-xl px-4 py-3 mb-4 text-sm ${rule ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
          role="status"
          id="learning-commission-rule"
        >
          {rule ? (
            <>
              <strong>Calculation only.</strong> The columns marked &quot;(calc.)&quot; show what the active commission rule for
              the Learning service would take from each enrolment&apos;s recorded amount: {rule.text} (in force since{' '}
              {formatDate(rule.effectiveFrom)}). They are not ledger entries and no money has moved.
            </>
          ) : (
            <>
              <strong>No rule configured.</strong> There is no active commission rule for the Learning service, so no
              commission, GST or gateway fee is calculated. Add and activate one in{' '}
              <Link href="/finance/commissions" className="underline">
                Finance &rsaquo; Commission Settings
              </Link>
              .
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4 text-sm text-gray-700 space-y-1">
        <p>
          &quot;Collected&quot; is the total &quot;Amount paid&quot; the team recorded on enrolments in the instructor&apos;s
          courses. &quot;Refunded&quot; is the amount on enrolments now marked &quot;Refunded&quot;.
          {canSeeCharges ? ' Charges are calculated on each enrolment that is not refunded.' : ''}
        </p>
        <p>
          Learning payments are not connected to the payment gateway and are not written to the finance ledger, so{' '}
          <Link href="/finance/settlements" className="text-teal underline">
            Finance &rsaquo; Settlements
          </Link>{' '}
          has nothing to raise an instructor settlement from yet. Until it does, this statement and its CSV are the record
          Finance can pay from; the settlement columns stay at zero.
          {!canSeeSettlements && rows ? ' Your role cannot view settlements, so those columns are hidden.' : ''}
        </p>
      </div>

      {report.loading && !rows ? (
        <Spinner />
      ) : rows ? (
        <ReportTable<Row>
          title="Instructors"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.instructorId}
          emptyTitle="No instructors yet."
          emptyHint="Add instructors on the Instructors screen. Their enrolments and settlements will be listed here."
        />
      ) : null}
    </AdminShell>
  )
}
