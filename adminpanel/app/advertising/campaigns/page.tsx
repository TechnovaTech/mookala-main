'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import AdminShell from '@/components/AdminShell'
import { Spinner, api } from '@/components/ui'
import CampaignPanel from '@/components/advertising/CampaignPanel'
import { linkClass } from '@/components/advertising/shared'

export default function Page() {
  // Statuses follow the dates when campaigns are read: bring them up to date before the list loads.
  const [ready, setReady] = useState(false)
  const [changed, setChanged] = useState(0)

  useEffect(() => {
    let cancelled = false
    api<{ changed: number }>('/api/admin/advertising/campaigns/sync')
      .then((data) => {
        if (!cancelled) setChanged(data.changed || 0)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <AdminShell title="Campaigns" subtitle="Campaign schedule, targeting, approval and performance counters">
        <Spinner />
      </AdminShell>
    )
  }

  return (
    <ResourcePage resource="ad-campaigns" detailActions={(item) => <CampaignPanel key={String(item._id)} campaign={item} />}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4 text-sm text-gray-700 space-y-1" data-campaign-help>
        <p>
          <strong>How a campaign runs.</strong> Open a campaign to upload its creative, then set it to &quot;Approved (scheduled)&quot;. It goes live by
          itself on its start date and is completed after its end date; pause and resume need a reason. See every placement over the coming weeks on{' '}
          <Link href="/advertising/scheduling" className={linkClass}>
            Campaign Scheduling
          </Link>
          .
        </p>
        <p>
          Impressions and clicks are reported by the user app when it shows or opens a live campaign. They cannot be typed in here. Performance by
          day is on{' '}
          <Link href="/advertising/reports" className={linkClass}>
            Ads Reports
          </Link>
          .
        </p>
        {changed > 0 && (
          <p className="text-blue-800" data-synced>
            {changed} status{changed === 1 ? ' was' : 'es were'} brought up to date with the dates just now.
          </p>
        )}
      </div>
    </ResourcePage>
  )
}
