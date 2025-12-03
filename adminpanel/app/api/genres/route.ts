import { NextResponse } from 'next/server';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  const genres = [
    'Rock',
    'Pop',
    'Hip Hop',
    'Jazz',
    'Classical',
    'Electronic',
    'Country',
    'R&B',
    'Reggae',
    'Folk',
    'Blues',
    'Punk',
    'Metal',
    'Indie',
    'Alternative'
  ];

  return NextResponse.json({ 
    success: true, 
    genres 
  });
}