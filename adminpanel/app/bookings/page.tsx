'use client'
import AdminShell from '@/components/AdminShell'
import BookingsTable from '@/components/bookings/BookingsTable'

export default function BookingsPage() {
  return (
    <AdminShell title="Bookings" subtitle="Ticket bookings, payments and check-ins">
      <BookingsTable />
    </AdminShell>
  )
}
