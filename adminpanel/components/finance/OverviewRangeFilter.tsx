'use client'
import React, { useEffect, useState } from 'react'
import { Button, inputClass } from '@/components/ui'

export interface RangeValue {
  preset: string
  from: string
  to: string
}

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

/** Query string for the range, as the finance and report APIs expect it. */
export function rangeQuery(value: RangeValue): string {
  const params = new URLSearchParams({ preset: value.preset })
  if (value.preset === 'custom') {
    params.set('from', value.from)
    params.set('to', value.to)
  }
  return params.toString()
}

/**
 * Date filter shared by the finance overview, reconciliation and reports:
 * today, 7 days, this month, this year or a custom range. Dates are whole days
 * in Asia/Kolkata; the server works out the preset ranges.
 */
export default function OverviewRangeFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: RangeValue
  onChange: (value: RangeValue) => void
  disabled?: boolean
}) {
  const [from, setFrom] = useState(value.from)
  const [to, setTo] = useState(value.to)
  const [custom, setCustom] = useState(value.preset === 'custom')

  useEffect(() => {
    setCustom(value.preset === 'custom')
    if (value.preset === 'custom') {
      setFrom(value.from)
      setTo(value.to)
    }
  }, [value])

  const invalid = !from || !to || from > to

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {PRESETS.map((preset) => {
          const active = preset.value === 'custom' ? custom : !custom && value.preset === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                if (preset.value === 'custom') setCustom(true)
                else {
                  setCustom(false)
                  onChange({ preset: preset.value, from: '', to: '' })
                }
              }}
              className={`px-3 py-1.5 rounded-full text-sm disabled:opacity-50 ${
                active ? 'bg-deep-blue text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {custom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!invalid) onChange({ preset: 'custom', from, to })
          }}
        >
          <div>
            <label htmlFor="range-from" className="block text-xs font-medium text-gray-600 mb-1">
              From
            </label>
            <input id="range-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} disabled={disabled} />
          </div>
          <div>
            <label htmlFor="range-to" className="block text-xs font-medium text-gray-600 mb-1">
              To
            </label>
            <input id="range-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} disabled={disabled} />
          </div>
          <Button type="submit" disabled={invalid || disabled}>
            Apply
          </Button>
        </form>
      )}
    </div>
  )
}
