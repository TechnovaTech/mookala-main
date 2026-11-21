'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import AdminShell from '@/components/AdminShell'
import { Spinner, api } from '@/components/ui'
import { linkClass } from '@/components/advertising/shared'

export default function Page() {
  // "Overdue" follows the due date when invoices are read: bring it up to date before the list loads.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    api('/api/admin/advertising/campaigns/sync')
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
      <AdminShell title="Advertisement Payments" subtitle="Invoices raised to advertisers and the payments recorded against them">
        <Spinner />
      </AdminShell>
    )
  }

  return (
    <ResourcePage
      resource="ad-payments"
      detailActions={(item) => (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {item.advertiser && (
            <Link href={`/advertising/advertisers/${item.advertiser}`} className={linkClass}>
              Advertiser account
            </Link>
          )}
          {item.campaign && (
            <Link href={`/advertising/campaigns?id=${item.campaign}`} className={linkClass}>
              Campaign
            </Link>
          )}
        </div>
      )}
    />
  )
}
