'use client'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { linkClass } from '@/components/advertising/shared'

export default function Page() {
  return (
    <ResourcePage
      resource="ad-applications"
      detailActions={(item) => (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {item.advertiser && (
            <Link href={`/advertising/advertisers/${item.advertiser}`} className={linkClass}>
              Advertiser account
            </Link>
          )}
          {item.campaign ? (
            <Link href={`/advertising/campaigns?id=${item.campaign}`} className={linkClass} data-campaign-link>
              Open the campaign created from this application
            </Link>
          ) : (
            <span className="text-gray-500">Approving this application creates its campaign as a draft.</span>
          )}
        </div>
      )}
    />
  )
}
