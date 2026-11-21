'use client'
import ResourcePage from '@/components/ResourcePage'
import { NoticeBar } from '@/components/ui'
import { APP_NOT_WIRED } from '@/components/memberships/shared'

export default function Page() {
  return (
    <ResourcePage resource="membership-plans">
      <NoticeBar notice={{ type: 'info', text: APP_NOT_WIRED }} />
      <p className="text-sm text-gray-600 mb-4">
        A plan that has subscriptions or payments cannot be deleted, only retired (with a reason): a retired plan cannot be
        chosen for a new subscription and is no longer offered to the apps. Changing a price needs a reason and applies from now
        on; subscriptions and past payments keep the price they were taken at.
      </p>
    </ResourcePage>
  )
}
