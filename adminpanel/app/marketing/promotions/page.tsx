import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { Card } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="promotions">
      <Card className="p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
        <span>The artwork the apps show today is managed on these screens:</span>
        <Link href="/banners" className="text-teal font-medium underline">
          Banners
        </Link>
        <Link href="/ads" className="text-teal font-medium underline">
          Advertisements
        </Link>
      </Card>
    </ResourcePage>
  )
}
