'use client'
import React from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/components/ui'

export interface TrendPoint {
  bucket: string
  gtv: number
  platformRevenue: number
  refunds: number
}

const GTV_COLOR = '#0A1172'
const REVENUE_COLOR = '#0D9488'
const REFUND_COLOR = '#B45309'
const AXIS = { fontSize: 12, fill: '#6b7280' }

function compact(value: number): string {
  if (Math.abs(value) >= 10_000_000) return '₹' + (value / 10_000_000).toFixed(1) + 'Cr'
  if (Math.abs(value) >= 100_000) return '₹' + (value / 100_000).toFixed(1) + 'L'
  if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(1) + 'k'
  return '₹' + value
}

function tickLabel(bucket: string): string {
  // "2026-11-21" -> "21 Nov", "2026-11" -> "Nov 2026"
  const parts = bucket.split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(parts[1]) - 1] || ''
  return parts.length === 3 ? `${Number(parts[2])} ${month}` : `${month} ${parts[0]}`
}

/**
 * Revenue trend. GTV and platform revenue differ by an order of magnitude, so
 * they are drawn as two charts that share the time axis instead of one chart
 * with two scales.
 */
export default function OverviewTrendChart({ data }: { data: TrendPoint[] }) {
  const tooltip = {
    formatter: (value: any) => formatMoney(Number(value)),
    labelFormatter: (label: any) => tickLabel(String(label)),
    contentStyle: { borderRadius: 8, borderColor: '#e5e7eb', fontSize: 13 },
    labelStyle: { color: '#111827', fontWeight: 600 },
    itemStyle: { color: '#374151' },
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <figure>
        <figcaption className="text-sm font-medium text-gray-700 mb-2">Gross transaction value</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={tickLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={24} />
              <YAxis tickFormatter={compact} tick={AXIS} tickLine={false} axisLine={false} width={64} />
              <Tooltip {...tooltip} cursor={{ fill: '#f9fafb' }} />
              <Bar dataKey="gtv" name="GTV" fill={GTV_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure>
        <figcaption className="text-sm font-medium text-gray-700 mb-2">Platform revenue and refunds</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={tickLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={24} />
              <YAxis tickFormatter={compact} tick={AXIS} tickLine={false} axisLine={false} width={64} />
              <Tooltip {...tooltip} cursor={{ stroke: '#d1d5db' }} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="plainline"
                height={28}
                formatter={(value) => <span style={{ color: '#374151', fontSize: 13 }}>{value}</span>}
              />
              <Line type="linear" dataKey="platformRevenue" name="Platform revenue" stroke={REVENUE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              <Line
                type="linear"
                dataKey="refunds"
                name="Refunds"
                stroke={REFUND_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}
