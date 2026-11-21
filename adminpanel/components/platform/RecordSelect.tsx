'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api, inputClass } from '@/components/ui'

export type PickRecord = Record<string, any> & { _id: string }

/** Loads the newest records of a generic resource, for panels that act on one of them. */
export function useRecords(resource: string) {
  const [records, setRecords] = useState<PickRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<any>(`/api/admin/r/${resource}?limit=200`)
      setRecords(data.items || [])
      setError('')
    } catch (e: any) {
      setError(e.message || 'Could not load the list.')
    } finally {
      setLoading(false)
    }
  }, [resource])

  useEffect(() => {
    reload()
  }, [reload])

  return { records, loading, error, reload }
}

/** A labelled dropdown of records with a reload button. */
export function RecordSelect({
  id,
  label,
  records,
  value,
  onChange,
  onReload,
  loading,
  describe,
  emptyText,
}: {
  id: string
  label: string
  records: PickRecord[]
  value: string
  onChange: (id: string) => void
  onReload: () => void
  loading: boolean
  describe: (record: PickRecord) => string
  emptyText: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex gap-2">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} disabled={loading}>
          <option value="">{loading ? 'Loading...' : records.length === 0 ? emptyText : 'Select...'}</option>
          {records.map((record) => (
            <option key={record._id} value={record._id}>
              {describe(record)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onReload}
          aria-label="Reload the list"
          title="Reload the list"
          className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  )
}
