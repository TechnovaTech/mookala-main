import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'

export default function Page() {
  return (
    <ResourcePage resource="coupons">
      <NoticeBar
        notice={{
          type: 'info',
          text: 'Coupons are stored and can be checked through POST /api/public/coupons/validate, which works out the discount without using the coupon up. The booking flow in the mobile apps and website does not apply coupons yet, so no customer can redeem one today and "Times used" stays at 0 until that is connected.',
        }}
      />
    </ResourcePage>
  )
}
