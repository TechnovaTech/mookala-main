'use client'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import PartyList from '@/components/artists/PartyList'

export default function ArtistsPage() {
  return (
    <AdminShell
      title="Artists"
      subtitle="Every registered artist, with KYC status, category and account status"
      actions={
        <Link
          href="/kyc?role=artist"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-deep-blue text-white hover:bg-indigo"
        >
          Review applications
        </Link>
      }
    >
      <PartyList role="artist" />
    </AdminShell>
  )
}
