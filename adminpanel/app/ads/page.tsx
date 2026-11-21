'use client'
import AdminShell from '@/components/AdminShell'
import PlacementManager from '@/components/catalogue/PlacementManager'

export default function AdsPage() {
  return (
    <AdminShell title="Sponsored Ads" subtitle="Sponsored placements in the user app, with run dates, expiry and activation">
      <PlacementManager kind="ad" />
    </AdminShell>
  )
}
