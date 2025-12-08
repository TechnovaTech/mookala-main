import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { action } = await request.json();
    const { db } = await connectToDatabase();
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(params.id) });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'toggle') {
      const newStatus = user.isActive === false ? true : false;
      await db.collection('users').updateOne(
        { _id: new ObjectId(params.id) },
        { $set: { isActive: newStatus, updatedAt: new Date() } }
      );
      return NextResponse.json({ success: true, isActive: newStatus });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(params.id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}