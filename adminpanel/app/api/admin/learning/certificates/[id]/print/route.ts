import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * A printable certificate, as a plain HTML page an admin opens from the
 * certificate record and prints with the browser's own Print command.
 *
 * The page carries no script. Every value from the database is escaped, and
 * the response forbids scripts and outside resources.
 */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function day(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #f3f4f6; color: #1f2937; font-family: Georgia, 'Times New Roman', serif; }
  .hint { max-width: 1000px; margin: 0 auto 16px; font: 14px/1.5 system-ui, sans-serif; color: #4b5563; }
  .sheet { position: relative; max-width: 1000px; margin: 0 auto; background: #fff; border: 10px double #1e3a5f; padding: 56px 64px; text-align: center; overflow: hidden; }
  .brand { font-size: 20px; letter-spacing: 0.3em; text-transform: uppercase; color: #1e3a5f; }
  h1 { font-size: 40px; font-weight: normal; margin: 20px 0 28px; color: #1e3a5f; }
  .line { font-size: 17px; margin: 8px 0; color: #4b5563; }
  .name { font-size: 34px; margin: 14px 0; border-bottom: 1px solid #9ca3af; display: inline-block; padding: 0 32px 8px; overflow-wrap: anywhere; }
  .course { font-size: 26px; margin: 14px 0; color: #111827; overflow-wrap: anywhere; }
  .facts { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 56px; margin-top: 40px; font: 14px/1.5 system-ui, sans-serif; }
  .facts dt { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #6b7280; }
  .facts dd { margin: 2px 0 0; font-size: 15px; color: #111827; overflow-wrap: anywhere; }
  .verify { margin-top: 32px; font: 12px/1.5 system-ui, sans-serif; color: #6b7280; overflow-wrap: anywhere; }
  .revoked { margin: 0 auto 24px; padding: 12px 16px; border: 2px solid #b91c1c; color: #b91c1c; font: bold 16px/1.4 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
  .revoked small { display: block; font-weight: normal; text-transform: none; letter-spacing: 0; margin-top: 4px; }
  .stamp { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); font: bold 120px/1 system-ui, sans-serif; color: rgba(185, 28, 28, 0.14); letter-spacing: 0.1em; pointer-events: none; }
  .problem { max-width: 640px; margin: 80px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; font: 16px/1.5 system-ui, sans-serif; }
  @media print { body { background: #fff; padding: 0; } .hint { display: none; } .sheet { max-width: none; } }
</style>
</head>
<body>
${body}
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function problemPage(message: string, status: number) {
  return page('Certificate', `<div class="problem" role="alert">${escapeHtml(message)}</div>`, status);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'learning:view');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return problemPage('This is not a valid certificate record.', 400);

  try {
    const { db } = await connectToDatabase();
    const certificate = await db.collection('certificates').findOne({ _id: id });
    if (!certificate) return problemPage('This certificate record does not exist.', 404);

    const enrolmentId = toObjectId(certificate.enrolment);
    const courseId = toObjectId(certificate.course);
    const [enrolment, course] = await Promise.all([
      enrolmentId
        ? db.collection('enrolments').findOne({ _id: enrolmentId }, { projection: { completedOn: 1, studentName: 1 } })
        : null,
      courseId ? db.collection('courses').findOne({ _id: courseId }, { projection: { title: 1, instructor: 1, duration: 1 } }) : null,
    ]);
    const instructorId = toObjectId(course?.instructor);
    const instructor = instructorId
      ? await db.collection('instructors').findOne({ _id: instructorId }, { projection: { name: 1 } })
      : null;

    const number = String(certificate.certificateNumber || '');
    const revoked = certificate.status === 'revoked';
    const verifyUrl = `${request.nextUrl.origin}/api/public/certificates/${encodeURIComponent(number)}`;

    const facts: [string, string][] = [
      ['Certificate number', number],
      ['Issued on', day(certificate.issuedOn)],
      ['Completed on', day(enrolment?.completedOn)],
      ['Instructor', instructor?.name ? String(instructor.name) : ''],
      ['Course duration', course?.duration ? String(course.duration) : ''],
    ];

    const body = `
<p class="hint">This is the printable certificate. Use your browser's Print command (Ctrl+P or Cmd+P) to print it or save it as a PDF. This line is not printed.</p>
<div class="sheet">
  ${
    revoked
      ? `<div class="stamp" aria-hidden="true">REVOKED</div>
  <div class="revoked" role="alert">This certificate has been revoked and is not valid<small>${
    certificate.statusReason ? 'Reason: ' + escapeHtml(certificate.statusReason) : ''
  }${certificate.statusChangedAt ? ' · Revoked on ' + escapeHtml(day(certificate.statusChangedAt)) : ''}</small></div>`
      : ''
  }
  <div class="brand">Mookalaa</div>
  <h1>Certificate of Completion</h1>
  <p class="line">This is to certify that</p>
  <div class="name" data-field="studentName">${escapeHtml(certificate.studentName || enrolment?.studentName || '')}</div>
  <p class="line">has completed the course</p>
  <div class="course" data-field="courseTitle">${escapeHtml(course?.title || 'Course no longer on record')}</div>
  <dl class="facts">
    ${facts
      .filter(([, value]) => value)
      .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join('\n    ')}
  </dl>
  <p class="verify">Anyone can check this certificate at ${escapeHtml(verifyUrl)}</p>
</div>`;

    return page(`Certificate ${number}`, body);
  } catch (error) {
    console.error('Printable certificate failed:', error);
    return problemPage('The certificate could not be opened right now.', 500);
  }
}
