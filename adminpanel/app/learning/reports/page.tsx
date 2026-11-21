'use client'
import React from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { NoticeBar, Spinner, StatCard, formatMoney } from '@/components/ui'
import { DateRangeBar, ReportTable, formatCount, formatPercent, rangeQuery, useReport, type Column } from '@/components/learning/ReportKit'

interface Row {
  enrolments: number
  completions: number
  dropped: number
  refunded: number
  revenue: number
  completionRate: number | null
}
interface CourseRow extends Row {
  courseId: string
  course: string
  category: string
  instructor: string
}
interface CategoryRow extends Row {
  categoryId: string
  category: string
}
interface Report {
  totals: Row & {
    instructorsWithEnrolments: number
    verifiedInstructors: number
    approvedCourses: number
    certificatesIssued: number
    certificatesRevoked: number
  }
  byCourse: CourseRow[]
  byCategory: CategoryRow[]
}

const API = '/api/admin/learning/reports'

const numbers: Column<any>[] = [
  { key: 'enrolments', label: 'Enrolments', align: 'right', render: (row) => formatCount(row.enrolments) },
  { key: 'completions', label: 'Completions', align: 'right', render: (row) => formatCount(row.completions) },
  { key: 'completionRate', label: 'Completion rate', align: 'right', render: (row) => formatPercent(row.completionRate) },
  { key: 'dropped', label: 'Dropped', align: 'right', render: (row) => formatCount(row.dropped) },
  { key: 'refunded', label: 'Refunded', align: 'right', render: (row) => formatCount(row.refunded) },
  { key: 'revenue', label: 'Revenue', align: 'right', render: (row) => formatMoney(row.revenue) },
]

export default function Page() {
  const report = useReport<Report>(API)
  const totals = report.data?.totals
  const ranged = Boolean(report.range.from || report.range.to)
  const emptyHint = ranged
    ? 'No student was enrolled in this date range. Widen the range or choose "All dates".'
    : 'The mobile apps do not enrol students yet. Numbers appear here once the team adds enrolments on the Students screen.'

  return (
    <AdminShell title="Learning Reports" subtitle="Enrolments, completions, revenue, instructors and certificates">
      {report.error && <NoticeBar notice={{ type: 'error', text: report.error }} />}
      <DateRangeBar
        idPrefix="learning-report"
        draft={report.draft}
        onChange={report.setDraft}
        onApply={report.apply}
        onClear={report.clear}
        note='The range selects enrolments by their "Enrolled on" date and certificates by their "Issued on" date. A completion is one of those enrolments that is now marked "Completed". Revenue is the "Amount paid" recorded on those enrolments, leaving out refunded ones; learning payments are entered by the team and are not connected to the payment gateway.'
      />

      {report.loading && !report.data ? (
        <Spinner />
      ) : totals ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <StatCard label="Enrolments" value={formatCount(totals.enrolments)} />
            <StatCard label="Completions" value={formatCount(totals.completions)} />
            <StatCard label="Completion rate" value={formatPercent(totals.completionRate)} />
            <StatCard label="Revenue" value={formatMoney(totals.revenue)} />
            <StatCard
              label="Active instructors"
              value={formatCount(totals.instructorsWithEnrolments)}
              hint={`${formatCount(totals.verifiedInstructors)} verified in total`}
            />
            <StatCard
              label="Certificates issued"
              value={formatCount(totals.certificatesIssued)}
              hint={totals.certificatesRevoked > 0 ? `${formatCount(totals.certificatesRevoked)} revoked` : undefined}
              tone="red"
            />
          </div>
          <p className="text-xs text-gray-500 -mt-3 mb-6">
            &quot;Active instructors&quot; counts instructors whose courses had at least one enrolment in the range.
          </p>

          <ReportTable<CourseRow>
            title="By course"
            columns={[
              {
                key: 'course',
                label: 'Course',
                render: (row) =>
                  /^[a-f0-9]{24}$/i.test(row.courseId) ? (
                    <Link href={`/learning/students?f_course=${row.courseId}`} className="text-teal underline" title="Open this course's enrolments">
                      {row.course}
                    </Link>
                  ) : (
                    row.course
                  ),
              },
              { key: 'category', label: 'Category' },
              { key: 'instructor', label: 'Instructor' },
              ...numbers,
            ]}
            rows={report.data!.byCourse}
            rowKey={(row) => row.courseId}
            emptyTitle="No enrolments to report."
            emptyHint={emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'courses' })}
          />

          <ReportTable<CategoryRow>
            title="By category"
            columns={[{ key: 'category', label: 'Category' }, ...numbers]}
            rows={report.data!.byCategory}
            rowKey={(row) => row.categoryId || 'none'}
            emptyTitle="No enrolments to report."
            emptyHint={emptyHint}
            exportHref={API + rangeQuery(report.range, { export: 'categories' })}
          />
        </>
      ) : null}
    </AdminShell>
  )
}
