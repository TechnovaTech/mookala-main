'use client'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import PartyList from '@/components/artists/PartyList'

export default function OrganizersPage() {
  return (
    <AdminShell
      title="Organisers"
      subtitle="Every registered event organiser, with KYC status, events and account status"
      actions={
        <Link
          href="/kyc?role=organizer"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-deep-blue text-white hover:bg-indigo"
        >
          Review applications
        </Link>
      }
    >
      <PartyList role="organizer" />
    </AdminShell>
  )
}
