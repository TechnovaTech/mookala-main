import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

const BLOCK_TYPES = ['VIP', 'Premium', 'Normal', 'Balcony'];

/** POST /api/venues/[id]/seats: saves the seat blocks. Capacity is the total of the blocks. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'venues:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid venue id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const input = body?.seatConfig;
    if (!input || typeof input !== 'object' || !Array.isArray(input.blocks)) {
      return NextResponse.json({ success: false, error: 'Seat configuration is required' }, { status: 400 });
    }
    if (input.blocks.length > 100) {
      return NextResponse.json({ success: false, error: 'A venue can have at most 100 blocks' }, { status: 400 });
    }

    const blocks: { name: string; type: string; totalSeats: number }[] = [];
    const names = new Set<string>();
    for (const raw of input.blocks) {
      const name = asString(raw?.name, 40);
      const type = asString(raw?.type, 40) || 'Normal';
      const totalSeats = typeof raw?.totalSeats === 'number' ? raw.totalSeats : parseInt(String(raw?.totalSeats ?? ''), 10);

      if (!name) return NextResponse.json({ success: false, error: 'Every block needs a name' }, { status: 400 });
      if (names.has(name.toLowerCase())) {
        return NextResponse.json({ success: false, error: `Block name "${name}" is used twice` }, { status: 400 });
      }
      if (!BLOCK_TYPES.includes(type)) {
        return NextResponse.json({ success: false, error: `Block "${name}" has an unknown type` }, { status: 400 });
      }
      if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 100000) {
        return NextResponse.json({ success: false, error: `Block "${name}" needs a whole number of seats, 1 or more` }, { status: 400 });
      }
      names.add(name.toLowerCase());
      blocks.push({ name, type, totalSeats });
    }

    const seatConfig = { numberOfBlocks: blocks.length, blocks };
    const capacity = blocks.reduce((sum, block) => sum + block.totalSeats, 0);

    const { db } = await connectToDatabase();
    const existing = await db.collection('venues').findOne({ _id: id }, { projection: { name: 1, seatConfig: 1, capacity: 1 } });
    if (!existing) return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });

    await db
      .collection('venues')
      .updateOne({ _id: id }, { $set: { seatConfig, capacity, updatedAt: new Date(), updatedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'venues',
      entityType: 'venue',
      entityId: String(id),
      entityLabel: existing.name,
      before: { capacity: existing.capacity ?? 0, seatConfig: existing.seatConfig ?? null },
      after: { capacity, seatConfig },
      request,
    });

    return NextResponse.json({ success: true, capacity });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update seat configuration' }, { status: 500 });
  }
}
