import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { readBody, requireAppUser } from '@/lib/app-auth';
import { recordCampaignOpen } from '@/lib/push-campaigns';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/notifications/opened  { phone, campaignId }
 *
 * The app reports that the customer opened a push campaign notification (the
 * campaignId comes from the notification's data payload). Counted once per
 * phone and campaign, so sending it again changes nothing, and only for a
 * phone the campaign was actually sent to. Needs the app session for the phone.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const auth = requireAppUser(request, body.phone);
    if (!auth.ok) return auth.response;
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';

    const { db } = await connectToDatabase();
    const result = await recordCampaignOpen(db, auth.phone, campaignId);
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, recorded: true, alreadyRecorded: result.alreadyRecorded });
  } catch (error) {
    console.error('Recording a notification open failed:', error);
    return NextResponse.json({ success: false, error: 'Could not record the open' }, { status: 500 });
  }
}
