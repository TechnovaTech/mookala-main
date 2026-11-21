'use client'
import ResourcePage from '@/components/ResourcePage'
import OrderTimeline from '@/components/wishes/OrderTimeline'
import WishTabs from '@/components/wishes/WishTabs'

export default function Page() {
  return (
    <ResourcePage resource="wish-orders" detailActions={(item) => <OrderTimeline item={item} />}>
      <WishTabs current="/wishes/orders" />
    </ResourcePage>
  )
}
