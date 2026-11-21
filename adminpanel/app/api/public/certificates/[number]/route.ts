import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Public, read-only certificate check for the website and apps.
 *
 *   GET /api/public/certificates/MKL-2026-7K3QX9PD
 *
 * Returns only whether the certificate is valid, the student's name, the
 * course title, the issue date and whether it was revoked. No phone number or
 * other private detail is returned.
 */
export async function GET(_request: NextRequest, { params }: { params: { number: string } }) {
  const number = String(params.number || '').trim().toUpperCase();
  if (!/^MKL-\d{4}-[A-Z0-9]{8}$/.test(number)) {
    return fail('This is not a valid certificate number.', 400, { valid: false });
  }

  try {
    const { db } = await connectToDatabase();
    const certificate = await db.collection('certificates').findOne({ certificateNumber: number });
    if (!certificate) return fail('No certificate was found with this number.', 404, { valid: false });

    const courseId = toObjectId(certificate.course);
    const course = courseId
      ? await db.collection('courses').findOne({ _id: courseId }, { projection: { title: 1 } })
      : null;

    const revoked = certificate.status === 'revoked';
    return ok({
      valid: !revoked,
      revoked,
      studentName: certificate.studentName || '',
      courseTitle: course?.title || '',
      issuedOn: certificate.issuedOn || null,
    });
  } catch (error) {
    console.error('Certificate check failed:', error);
    return fail('The certificate could not be checked right now.', 500);
  }
}
