'use client'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { Card, NoticeBar, Spinner, api, inputClass, type Notice } from '@/components/ui'
import PromotionSchedule, { type Schedule } from '@/components/marketing/PromotionSchedule'

const VIEWS = [
  { value: 'list', label: 'Promotions' },
  { value: 'schedule', label: 'Schedule by placement' },
]

export default function Page() {
  const [view, setView] = useState('list')
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [weeks, setWeeks] = useState(8)
  const [notice, setNotice] = useState<Notice>(null)
  // The list is shown once stored statuses have been brought in line with the dates.
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)

  const loadSchedule = useCallback(async (w: number) => {
    try {
      setSchedule(await api<Schedule>(`/api/admin/marketing/promotions/schedule?weeks=${w}`))
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message || 'Could not load the schedule.' })
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    loadSchedule(weeks)
  }, [loadSchedule, weeks, version])

  const tabs = (
    <div className="flex gap-2 mb-4" role="tablist" aria-label="Promotion views">
      {VIEWS.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={view === option.value}
          onClick={() => {
            setView(option.value)
            if (option.value === 'schedule') setVersion((v) => v + 1)
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            view === option.value ? 'bg-deep-blue text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  return (
    <ResourcePage key={ready ? 'ready' : 'syncing'} resource="promotions">
      {tabs}
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      {view === 'list' && (
        <Card className="p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
          <span>Banners and ads that are active by themselves are managed on these screens:</span>
          <Link href="/banners" className="text-teal font-medium underline">
            Banners
          </Link>
          <Link href="/ads" className="text-teal font-medium underline">
            Advertisements
          </Link>
        </Card>
      )}
      {view === 'schedule' && (
        <>
          <div className="flex items-end gap-3 mb-4">
            <label className="text-sm text-gray-700">
              <span className="block mb-1 font-medium">Weeks shown</span>
              <select className={inputClass} value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value, 10))}>
                {[4, 8, 12, 26].map((w) => (
                  <option key={w} value={w}>
                    {w} weeks
                  </option>
                ))}
              </select>
            </label>
          </div>
          {schedule ? <PromotionSchedule schedule={schedule} /> : <Spinner />}
        </>
      )}
    </ResourcePage>
  )
}
