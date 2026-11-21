'use client'
import React from 'react'
import { formatMoney } from '@/components/ui'

/**
 * Gross, commission, GST, gateway fees, refunds and net for each service, from
 * the ledger. Every figure opens the ledger entries that add up to it.
 */

export interface StatementFigures {
  payments: number
  gross: number
  commission: number
  gstOnCommission: number
  gstOnSales: number
  gatewayFees: number
  refunds: number
  refundDeductions: number
  settled: number
  netPayable: number
  netRevenue: number
  entries: number
}

export interface StatementServiceRow extends StatementFigures {
  service: string
  label: string
}

/** The statements screen, opened on the ledger entries behind one figure. */
export function entriesHref(options: { service?: string; type?: string; from?: string | null; to?: string | null; payeeType?: string; payeeId?: string }): string {
  const params = new URLSearchParams()
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)
  if (options.service) params.set('service', options.service)
  if (options.type) params.set('type', options.type)
  if (options.payeeId) {
    params.set('payeeId', options.payeeId)
    if (options.payeeType) params.set('payeeType', options.payeeType)
  }
  params.set('entries', '1')
  return '/finance/statements?' + params.toString() + '#entries'
}

export const FIGURE_COLUMNS: { key: keyof StatementFigures; label: string; type: string; hint?: string }[] = [
  { key: 'gross', label: 'Gross', type: 'payment' },
  { key: 'commission', label: 'Commission', type: 'commission' },
  { key: 'gstOnCommission', label: 'GST on commission', type: 'gst' },
  { key: 'gatewayFees', label: 'Gateway fees', type: 'gateway_fee' },
  { key: 'refunds', label: 'Refunds', type: 'refund' },
  { key: 'refundDeductions', label: 'Refund deductions kept', type: 'refund_deduction' },
]

export function FigureLink({ value, href, label, strong }: { value: number; href: string; label: string; strong?: boolean }) {
  if (!value) return <span className="text-gray-400">{formatMoney(0)}</span>
  return (
    // A full page load: the statements screen reads the figure to open from the address.
    <a href={href} aria-label={label} className={`hover:underline ${strong ? 'font-semibold text-deep-blue' : 'text-gray-900'}`}>
      {formatMoney(value)}
    </a>
  )
}

export default function StatementServiceTable({
  rows,
  total,
  from,
  to,
  hideEmpty,
}: {
  rows: StatementServiceRow[]
  total?: StatementFigures | null
  from?: string | null
  to?: string | null
  /** Leave out services with no ledger entry in the period. */
  hideEmpty?: boolean
}) {
  const shown = hideEmpty ? rows.filter((r) => r.entries > 0) : rows
  const th = 'px-4 py-3 font-medium text-right whitespace-nowrap'
  const td = 'px-4 py-3 text-right whitespace-nowrap'

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 font-medium">Service</th>
            <th className={th}>Payments</th>
            {FIGURE_COLUMNS.map((c) => (
              <th key={c.key} className={th}>
                {c.label}
              </th>
            ))}
            <th className={th}>Net revenue</th>
            <th className={th}>Net payable to payees</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.service} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
              <td className={td}>{row.payments}</td>
              {FIGURE_COLUMNS.map((c) => (
                <td key={c.key} className={td}>
                  <FigureLink
                    value={row[c.key]}
                    href={entriesHref({ service: row.service, type: c.type, from, to })}
                    label={`${c.label} for ${row.label}: open the ledger entries`}
                  />
                </td>
              ))}
              <td className={td}>
                <FigureLink
                  value={row.netRevenue}
                  href={entriesHref({ service: row.service, from, to })}
                  label={`Net revenue for ${row.label}: open the ledger entries`}
                />
              </td>
              <td className={td}>
                <FigureLink
                  strong
                  value={row.netPayable}
                  href={entriesHref({ service: row.service, from, to })}
                  label={`Net payable for ${row.label}: open the ledger entries`}
                />
              </td>
            </tr>
          ))}
          {total && (
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-deep-blue">
              <td className="px-4 py-3">Total</td>
              <td className={td}>{total.payments}</td>
              {FIGURE_COLUMNS.map((c) => (
                <td key={c.key} className={td}>
                  {formatMoney(total[c.key])}
                </td>
              ))}
              <td className={td}>{formatMoney(total.netRevenue)}</td>
              <td className={td}>{formatMoney(total.netPayable)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
