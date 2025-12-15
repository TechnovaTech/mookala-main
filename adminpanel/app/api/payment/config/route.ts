import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to get payment config' }, { status: 500 });
  }
}