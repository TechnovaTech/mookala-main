'use client'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/components/ui'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-21" -> "21 Nov", "2026-11" -> "Nov 2026", "2026" -> "2026". */
export function periodLabel(period: string): string {
  const parts = period.split('-')
  if (parts.length === 3) return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1] || ''}`
  if (parts.length === 2) return `${MONTHS[Number(parts[1]) - 1] || ''} ${parts[0]}`
  return period
}

function compactMoney(value: number): string {
  if (Math.abs(value) >= 10_000_000) return '₹' + (value / 10_000_000).toFixed(1) + 'Cr'
  if (Math.abs(value) >= 100_000) return '₹' + (value / 100_000).toFixed(1) + 'L'
  if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(1) + 'k'
  return '₹' + value
}

export interface TrendPoint {
  period: string
  gtv: number
  platformRevenue: number
  refunds: number
}

export function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72" role="img" aria-label="Revenue trend chart: gross transaction value and platform revenue per period">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12, fill: '#6b7280' }} minTickGap={16} />
          <YAxis tickFormatter={compactMoney} tick={{ fontSize: 12, fill: '#6b7280' }} width={64} />
          <Tooltip
            formatter={(value: any, name: any) => [formatMoney(Number(value)), name]}
            labelFormatter={(label: any) => periodLabel(String(label))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="gtv" name="Gross transaction value" stroke="#0A1172" strokeWidth={2} dot={data.length <= 31} />
          <Line type="linear" dataKey="platformRevenue" name="Platform revenue" stroke="#0E7C7B" strokeWidth={2} dot={data.length <= 31} />
          <Line type="linear" dataKey="refunds" name="Refunds" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function NewUsersChart({ data }: { data: { period: string; count: number }[] }) {
  return (
    <div className="h-56" role="img" aria-label="New users per period">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="period" tickFormatter={periodLabel} tick={{ fontSize: 12, fill: '#6b7280' }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} width={40} />
          <Tooltip formatter={(value: any) => [value, 'New users']} labelFormatter={(label: any) => periodLabel(String(label))} />
          <Bar dataKey="count" name="New users" fill="#0E7C7B" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
