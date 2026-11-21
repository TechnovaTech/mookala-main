'use client'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import ResourcePage from '@/components/ResourcePage'
import SubscriptionSummary, { type Summary } from '@/components/memberships/SubscriptionSummary'
import { memberHref } from '@/components/memberships/shared'
import { Spinner, api } from '@/components/ui'

export default function Page() {
  // The summary is loaded first: loading it stores "expired" on subscriptions
  // past their expiry date, so the list never shows one of them as active.
  const [state, setState] = useState<{ ready: boolean; summary: Summary | null }>({ ready: false, summary: null })

  // One request only, even when React runs the effect twice in development:
  // the first answer is the one that says how many subscriptions were expired.
  const request = useRef<Promise<Summary | null> | null>(null)

  useEffect(() => {
    if (!request.current) request.current = api<Summary>('/api/admin/memberships/summary').catch(() => null)
    request.current.then((summary) => setState({ ready: true, summary }))
  }, [])

  if (!state.ready) {
    return (
      <AdminShell title="Subscriptions" subtitle="Who holds which plan, when it expires and its current state">
        <Spinner />
      </AdminShell>
    )
  }

  return (
    <ResourcePage
      resource="membership-subscriptions"
      detailActions={(item) => (
        <Link
          href={memberHref(String(item._id))}
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-deep-blue text-white hover:bg-indigo"
        >
          Open member view (payments, renewals, reminders, support cases)
        </Link>
      )}
    >
      <SubscriptionSummary initial={state.summary} />
    </ResourcePage>
  )
}
