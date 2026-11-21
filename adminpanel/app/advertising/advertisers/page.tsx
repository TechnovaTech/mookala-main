'use client'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { linkClass } from '@/components/advertising/shared'

export default function Page() {
  return (
    <ResourcePage
      resource="advertisers"
      detailActions={(item) => (
        <Link href={`/advertising/advertisers/${item._id}`} className={linkClass} data-account-link>
          Open advertiser account: applications, campaigns, invoices, payments and history
        </Link>
      )}
    />
  )
}
