'use client'
import React, { useEffect, useState } from 'react'
import { api } from '@/components/ui'
import { TabLinks } from '@/components/catalogue/shared'

interface Counts {
  failed: number
  delayed: number
  disputed: number
  overdue: number
  pastSchedule: number
}

/**
 * Links between the order screens and the delivery monitor. The monitor tab
 * carries the number of orders that need attention, counted when the screen loads.
 */
export default function WishTabs({ current, refreshKey = 0 }: { current: string; refreshKey?: number }) {
  const [counts, setCounts] = useState<Counts | null>(null)

  useEffect(() => {
    let cancelled = false
    api<{ counts: Counts }>('/api/admin/wishes/monitor')
      .then((data) => {
        if (!cancelled) setCounts(data.counts)
      })
      .catch(() => {
        // The tab simply shows no count; the monitor screen reports the error itself.
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const problems = counts ? counts.failed + counts.delayed + counts.disputed : 0
  const attention = counts ? ` (${problems} problem${problems === 1 ? '' : 's'}, ${counts.overdue} overdue)` : ''

  return (
    <div data-wish-tabs>
      <TabLinks
        current={current}
        tabs={[
          { href: '/wishes/orders', label: 'Template orders' },
          { href: '/wishes/custom', label: 'Custom wishes' },
          { href: '/wishes/orders/monitor', label: 'Delivery monitor' + attention },
        ]}
      />
    </div>
  )
}
