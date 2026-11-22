import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { Card } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="coupons">
      <Card className="p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
        <span>
          Customers enter a code on the website and app booking screens. Each booking that used a coupon, with the discount and its
          ledger entries, is listed under
        </span>
        <Link href="/marketing/redemptions" className="text-teal font-medium underline">
          Coupon redemptions
        </Link>
      </Card>
    </ResourcePage>
  )
}
