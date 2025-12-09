import { NextResponse } from 'next/server';

const indianLanguages = [
  'Hindi',
  'Bengali',
  'Telugu',
  'Marathi',
  'Tamil',
  'Urdu',
  'Gujarati',
  'Kannada',
  'Odia',
  'Malayalam',
  'Punjabi',
  'Assamese',
  'Maithili',
  'Sanskrit',
  'Konkani',
  'Nepali',
  'Manipuri',
  'Sindhi',
  'Dogri',
  'Kashmiri',
  'Santali',
  'Bodo',
  'English'
];

export async function GET() {
  return NextResponse.json({ success: true, languages: indianLanguages });
}
