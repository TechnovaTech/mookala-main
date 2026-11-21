'use client'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { memberHref } from '@/components/memberships/shared'

export default function Page() {
  return (
    <ResourcePage
      resource="membership-payments"
      detailActions={(item) =>
        item.subscription ? (
          <Link
            href={memberHref(String(item.subscription))}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-deep-blue text-white hover:bg-indigo"
          >
            Open member view
          </Link>
        ) : null
      }
    >
      <p className="text-sm text-gray-600 mb-4">
        Recording a paid payment starts or renews the member&apos;s subscription (its expiry date moves to the end of the paid
        period) and writes the payment to the finance ledger. A failed payment marks the subscription &quot;Payment failed&quot;
        and leaves the expiry date alone. A paid payment cannot be edited or deleted afterwards; mark it refunded with a reason,
        which writes the refund to the ledger and takes the paid period back.
      </p>
    </ResourcePage>
  )
}
