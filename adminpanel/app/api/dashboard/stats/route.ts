import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timeAgo(date: unknown): string {
  if (!date) return '';
  const d = new Date(date as string);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (isNaN(secs)) return '';
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();

    const [
      totalUsers,
      activeArtists,
      liveEvents,
      revenueAgg,
      recentEvents,
      recentBookings,
      monthlyAgg,
    ] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('artists').countDocuments({}),
      db.collection('events').countDocuments({ status: 'approved' }),
      db
        .collection('bookings')
        .aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$totalPrice', 0] } } } }])
        .toArray(),
      db.collection('events').find({}).sort({ createdAt: -1 }).limit(6).toArray(),
      db.collection('bookings').find({}).sort({ createdAt: -1 }).limit(6).toArray(),
      db
        .collection('bookings')
        .aggregate([
          { $match: { createdAt: { $type: 'date' } } },
          {
            $group: {
              _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
              total: { $sum: { $ifNull: ['$totalPrice', 0] } },
            },
          },
          { $sort: { '_id.y': 1, '_id.m': 1 } },
          { $limit: 12 },
        ])
        .toArray(),
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    // ---- Recent activity (real): merge recent events + bookings, newest first ----
    type Act = { type: string; message: string; time: unknown; status: string };
    const acts: Act[] = [];
    for (const e of recentEvents) {
      const status = e.status === 'approved' ? 'success' : e.status === 'rejected' ? 'error' : 'warning';
      acts.push({
        type: 'event',
        message: `Event "${e.name || e.title || 'Untitled'}" is ${e.status || 'pending'}`,
        time: e.createdAt,
        status,
      });
    }
    for (const b of recentBookings) {
      acts.push({
        type: 'booking',
        message: `New booking for "${b.eventTitle || 'event'}" (₹${b.totalPrice || 0})`,
        time: b.createdAt || b.bookingDate,
        status: 'success',
      });
    }
    acts.sort((a, b) => new Date(b.time as string).getTime() - new Date(a.time as string).getTime());
    const recentActivity = acts.slice(0, 6).map((a) => ({
      type: a.type,
      message: a.message,
      status: a.status,
      time: timeAgo(a.time),
    }));

    // ---- Monthly revenue (real) ----
    const monthlyRevenue = monthlyAgg.map((r) => ({
      month: MONTHS[(r._id.m as number) - 1] || '',
      revenue: r.total || 0,
    }));

    return NextResponse.json({
      success: true,
      stats: { totalUsers, activeArtists, liveEvents, revenue },
      recentActivity,
      monthlyRevenue,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
