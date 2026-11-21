'use client'
import Link from 'next/link'
import AdminShell from '@/components/AdminShell'
import { Card } from '@/components/ui'

export default function Forbidden() {
  return (
    <AdminShell title="No access" subtitle="Your role does not include this section">
      <Card className="p-8 max-w-xl">
        <p className="text-gray-800">
          Your admin role does not include the page you tried to open. If you need it, ask a Super Admin to change your
          role or grant the permission under Security &amp; Audit → Admins &amp; Roles.
        </p>
        <Link href="/dashboard" className="inline-block mt-4 text-teal font-medium underline">
          Back to the dashboard
        </Link>
      </Card>
    </AdminShell>
  )
}
