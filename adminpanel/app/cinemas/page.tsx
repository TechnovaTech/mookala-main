'use client'
import Link from 'next/link'
import ResourcePage from '@/components/ResourcePage'
import { TabLinks } from '@/components/catalogue/shared'

const TABS = [
  { href: '/cinemas', label: 'Cinemas' },
  { href: '/cinemas/shows', label: 'Shows' },
]

export default function CinemasPage() {
  return (
    <ResourcePage
      resource="cinemas"
      detailActions={(item) => (
        <Link href={`/cinemas/${item._id}`} className="inline-flex items-center text-sm text-teal font-medium hover:underline">
          Open the cinema account: shows, seat inventory, transactions and settlements
        </Link>
      )}
    >
      <TabLinks tabs={TABS} current="/cinemas" />
    </ResourcePage>
  )
}
