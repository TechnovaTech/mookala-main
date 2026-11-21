'use client'
import AdminShell from '@/components/AdminShell'
import BannerManager from './BannerManager'

export default function BannersPage() {
  return (
    <AdminShell title="Homepage Banners" subtitle="Banners shown at the top of the user app, with scheduling and activation">
      <BannerManager />
    </AdminShell>
  )
}
