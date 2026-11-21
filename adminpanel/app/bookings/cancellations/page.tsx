'use client'
import AdminShell from '@/components/AdminShell'
import BookingsTable from '@/components/bookings/BookingsTable'

export default function CancellationsPage() {
  return (
    <AdminShell title="Cancellations" subtitle="Cancelled bookings, the refund rule applied and the refund status">
      <BookingsTable mode="cancellations" />
    </AdminShell>
  )
}
