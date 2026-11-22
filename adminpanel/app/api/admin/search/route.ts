import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { escapeRegex, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface Source {
  type: string;
  collection: string;
  permission: string;
  fields: string[];
  label: (doc: any) => string;
  detail: (doc: any) => string;
  href: (doc: any) => string;
}

/**
 * Each source is searched only when the admin may view that module, so the
 * results never include records the admin is not authorised to open.
 */
const SOURCES: Source[] = [
  {
    type: 'User',
    collection: 'users',
    permission: 'users:view',
    fields: ['name', 'phone', 'email'],
    label: (d) => d.name || d.phone || 'User',
    detail: (d) => [d.phone, d.city].filter(Boolean).join(' · '),
    href: (d) => `/users/${d._id}`,
  },
  {
    type: 'Artist',
    collection: 'artists',
    permission: 'artists:view',
    fields: ['name', 'phone', 'email', 'genre'],
    label: (d) => d.name || d.phone || 'Artist',
    detail: (d) => [d.genre, d.city, d.kycStatus ? `KYC ${d.kycStatus}` : ''].filter(Boolean).join(' · '),
    href: (d) => `/artists/${d._id}`,
  },
  {
    type: 'Organiser',
    collection: 'organizers',
    permission: 'organizers:view',
    fields: ['name', 'phone', 'email'],
    label: (d) => d.name || d.phone || 'Organiser',
    detail: (d) => [d.phone, d.city].filter(Boolean).join(' · '),
    href: (d) => `/organizers/${d._id}`,
  },
  {
    type: 'Venue',
    collection: 'venues',
    permission: 'venues:view',
    fields: ['name', 'location.city', 'location.address'],
    label: (d) => d.name || 'Venue',
    detail: (d) => [d.location?.city, d.location?.state].filter(Boolean).join(', '),
    href: (d) => `/venues/${d._id}`,
  },
  {
    type: 'Event',
    collection: 'events',
    permission: 'events:view',
    fields: ['name', 'category', 'location.city'],
    label: (d) => d.name || 'Event',
    detail: (d) => [d.startDate, d.status].filter(Boolean).join(' · '),
    href: (d) => `/events/${d._id}`,
  },
  {
    type: 'Booking',
    collection: 'bookings',
    permission: 'bookings:view',
    fields: ['eventTitle', 'userPhone', 'paymentId', 'bookingRef'],
    label: (d) => d.eventTitle || 'Booking',
    detail: (d) => [d.userPhone, d.status, d.totalPrice != null ? `₹${d.totalPrice}` : ''].filter(Boolean).join(' · '),
    href: (d) => `/bookings?q=${encodeURIComponent(String(d._id))}`,
  },
  {
    type: 'Advertiser',
    collection: 'advertisers',
    permission: 'ads:view',
    fields: ['businessName', 'contactName', 'phone', 'email'],
    label: (d) => d.businessName || d.contactName || 'Advertiser',
    detail: (d) => [d.phone, d.city].filter(Boolean).join(' · '),
    href: () => `/advertising/advertisers`,
  },
  {
    type: 'Support case',
    collection: 'supportCases',
    permission: 'support:view',
    fields: ['subject', 'customerPhone', 'customerName', 'bookingId'],
    label: (d) => d.subject || 'Support case',
    detail: (d) => [d.kind === 'ticket' ? 'Ticket' : 'Complaint', d.status, d.priority].filter(Boolean).join(' · '),
    href: (d) => `/support/${d.kind === 'ticket' ? 'tickets' : 'complaints'}?id=${d._id}`,
  },
  {
    type: 'Transaction',
    collection: 'transactions',
    permission: 'finance:view',
    fields: ['reference', 'gatewayPaymentId', 'gatewayOrderId', 'customerPhone', 'description'],
    label: (d) => d.reference || d.gatewayPaymentId || 'Transaction',
    detail: (d) => [d.type, d.status, d.amount != null ? `₹${d.amount}` : ''].filter(Boolean).join(' · '),
    href: (d) => `/finance/ledger?q=${encodeURIComponent(d.reference || '')}`,
  },
];

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;

  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return ok({ results: [] });

  const { db } = await connectToDatabase();
  const regex = { $regex: escapeRegex(q), $options: 'i' };
  const allowed = SOURCES.filter((source) => can(check.admin, source.permission));

  const groups = await Promise.all(
    allowed.map(async (source) => {
      try {
        const projection: Record<string, 1> = {};
        // Only the small fields needed for a result row. Images and KYC data are never read.
        for (const key of [
          'name', 'phone', 'email', 'city', 'genre', 'kycStatus', 'location', 'category', 'startDate', 'status',
          'eventTitle', 'userPhone', 'totalPrice', 'businessName', 'contactName', 'reference', 'gatewayPaymentId',
          'type', 'amount', 'subject', 'customerPhone', 'customerName', 'kind', 'priority',
        ]) projection[key] = 1;

        const docs = await db
          .collection(source.collection)
          .find({ $or: source.fields.map((field) => ({ [field]: regex })) }, { projection })
          .limit(5)
          .toArray();

        return docs.map((doc) => ({
          type: source.type,
          label: source.label(doc),
          detail: source.detail(doc),
          href: source.href(doc),
        }));
      } catch {
        return [];
      }
    })
  );

  return ok({ results: groups.flat() });
}
