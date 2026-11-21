import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin, roleOf } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { REDACTION_SUMMARY, redactDocument, type RedactionCount } from './redact';
import { logServerError } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Controlled logical export (requirements section 18): a JSON file of chosen
 * collections with secrets, identity numbers and images removed.
 *
 * Super Admin only, a written reason is required, the request is written to
 * the activity log and the export is recorded in the backup log. This is an
 * operational export. It is not a restorable full backup: indexes, images,
 * credentials and identity documents are not in it.
 */

const EXPORTABLE: { name: string; label: string }[] = [
  { name: 'users', label: 'Users' },
  { name: 'artists', label: 'Artists' },
  { name: 'organizers', label: 'Organisers' },
  { name: 'events', label: 'Events' },
  { name: 'bookings', label: 'Bookings' },
  { name: 'venues', label: 'Venues' },
  { name: 'categories', label: 'Categories' },
  { name: 'professionals', label: 'Professionals' },
  { name: 'hireRequests', label: 'Hire requests' },
  { name: 'transactions', label: 'Ledger transactions' },
  { name: 'refunds', label: 'Refunds' },
  { name: 'settlements', label: 'Settlements' },
  { name: 'commissionRules', label: 'Commission rules' },
  { name: 'refundRules', label: 'Refund rules' },
  { name: 'supportCases', label: 'Complaints and tickets' },
  { name: 'feedback', label: 'Feedback' },
  { name: 'userReports', label: 'Reported accounts' },
  { name: 'riskCases', label: 'Risk cases' },
  { name: 'incidents', label: 'Incidents' },
  { name: 'backupRecords', label: 'Backup log' },
  { name: 'auditLogs', label: 'Activity log' },
  { name: 'admins', label: 'Admin accounts (without passwords or 2FA secrets)' },
  { name: 'settings', label: 'Settings (without keys or secrets)' },
];

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DOCUMENTS = 50_000;
const MIN_REASON = 10;

const LIMITS = {
  maxBytes: MAX_BYTES,
  maxDocuments: MAX_DOCUMENTS,
  text: `An export stops at ${MAX_BYTES / (1024 * 1024)} MB or ${MAX_DOCUMENTS.toLocaleString('en-IN')} documents, whichever comes first, and says so in the file.`,
};

function sizeLabel(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function superAdmin(request: NextRequest) {
  const check = await requireAdmin(request, 'system:manage');
  if (!check.ok) return check;
  if (roleOf(check.admin) !== 'super_admin') {
    return { ok: false as const, response: fail('Only a Super Admin can export data.', 403) };
  }
  return check;
}

/** What can be exported, with current sizes, for the form on the Backups page. */
export async function GET(request: NextRequest) {
  const check = await superAdmin(request);
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const collections = await Promise.all(
      EXPORTABLE.map(async (entry) => ({
        ...entry,
        documents: await db.collection(entry.name).estimatedDocumentCount().catch(() => 0),
      }))
    );
    return ok({ collections, limits: LIMITS, removed: REDACTION_SUMMARY, minReasonLength: MIN_REASON });
  } catch (error) {
    console.error('Export options failed:', error);
    return fail('Could not load the export options', 500);
  }
}

export async function POST(request: NextRequest) {
  const check = await superAdmin(request);
  if (!check.ok) return check.response;
  const admin = check.admin;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Invalid request body');

  const reason = asString(body.reason, 500);
  if (reason.length < MIN_REASON) return fail(`A reason of at least ${MIN_REASON} characters is required for an export`);

  if (!Array.isArray(body.collections) || body.collections.length === 0) return fail('Choose at least one collection to export');
  const requested: string[] = Array.from(new Set(body.collections.filter((c: unknown) => typeof c === 'string')));
  const unknown = requested.filter((name) => !EXPORTABLE.some((e) => e.name === name));
  if (unknown.length || requested.length !== body.collections.length) {
    return fail(`These collections cannot be exported: ${unknown.join(', ') || 'invalid entries'}`);
  }

  let db: Awaited<ReturnType<typeof connectToDatabase>>['db'];
  try {
    db = (await connectToDatabase()).db;
  } catch (error) {
    console.error('Export could not reach the database:', error);
    return fail('The database is not available', 500);
  }

  const exportId = 'EXP-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const startedAt = new Date();
  const records = db.collection('backupRecords');

  const record = await records.insertOne({
    takenAt: startedAt,
    type: 'logical_export',
    scope: 'Collections: ' + requested.join(', '),
    size: null,
    reference: `${exportId}: downloaded by ${admin.email || 'unknown'}; no copy is kept on the server`,
    takenBy: admin.email || null,
    restoreTested: false,
    restoreTestedAt: null,
    notes: `Reason: ${reason}`,
    status: 'in_progress',
    createdAt: startedAt,
    updatedAt: startedAt,
    createdBy: admin.email || null,
    updatedBy: admin.email || null,
  });

  await logAudit({
    admin,
    action: 'export',
    module: 'system',
    entityType: 'backups',
    entityId: String(record.insertedId),
    entityLabel: exportId,
    reason,
    meta: { collections: requested, maxBytes: MAX_BYTES, maxDocuments: MAX_DOCUMENTS },
    request,
  });

  const encoder = new TextEncoder();
  let finished = false;

  const finish = async (status: 'completed' | 'failed', fields: Record<string, any>) => {
    if (finished) return;
    finished = true;
    try {
      await records.updateOne({ _id: record.insertedId }, { $set: { status, updatedAt: new Date(), ...fields } });
    } catch (error) {
      console.error('Could not update the export record:', error);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let bytes = 0;
      let documents = 0;
      let truncated = false;
      const counts: Record<string, number> = {};
      const redactions: RedactionCount = { secrets: 0, identity: 0, uploads: 0 };
      const write = (text: string) => {
        const chunk = encoder.encode(text);
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      };

      try {
        write(
          '{"meta":' +
            JSON.stringify({
              exportId,
              kind: 'Mookalaa operational export. Not a restorable backup.',
              database: db.databaseName,
              startedAt: startedAt.toISOString(),
              requestedBy: admin.email || null,
              reason,
              collections: requested,
              removed: REDACTION_SUMMARY,
              limits: LIMITS.text,
            }) +
            ',"collections":{'
        );

        for (let i = 0; i < requested.length; i++) {
          const name = requested[i];
          counts[name] = 0;
          write((i ? ',' : '') + JSON.stringify(name) + ':[');

          if (!truncated) {
            const cursor = db.collection(name).find({}).sort({ _id: 1 });
            for await (const doc of cursor) {
              const line = JSON.stringify(redactDocument(doc, name, redactions));
              if (documents >= MAX_DOCUMENTS || bytes + line.length + 512 > MAX_BYTES) {
                truncated = true;
                await cursor.close();
                break;
              }
              write((counts[name] ? ',' : '') + line);
              counts[name]++;
              documents++;
            }
          }
          write(']');
        }

        write(
          '},"summary":' +
            JSON.stringify({
              finishedAt: new Date().toISOString(),
              documents,
              documentsPerCollection: counts,
              truncated,
              truncatedNote: truncated ? `The export stopped at its limit. ${LIMITS.text} Collections after the limit are incomplete or empty.` : null,
              fieldsRemoved: redactions,
            }) +
            '}'
        );
        controller.close();

        await finish('completed', {
          size: sizeLabel(bytes),
          notes:
            `Reason: ${reason}\n${documents} documents exported` +
            ` (${Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ')}).` +
            (truncated ? ' Stopped at the size limit: the file is incomplete.' : '') +
            `\nRemoved before export: ${redactions.secrets} credential fields, ${redactions.identity} identity fields, ${redactions.uploads} images or uploads.`,
        });
        await logAudit({
          admin,
          action: 'export_completed',
          module: 'system',
          entityType: 'backups',
          entityId: String(record.insertedId),
          entityLabel: exportId,
          meta: { documents, bytes, truncated, counts },
        });
      } catch (error) {
        console.error('Export failed:', error);
        await logServerError('system.export', error, '/api/admin/system/export');
        await finish('failed', { statusReason: 'The export stopped with an error before it finished.' });
        controller.error(error);
      }
    },
    async cancel() {
      await finish('failed', { statusReason: 'The download was cancelled before it finished.' });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mookalaa-export-${exportId}.json"`,
      'Cache-Control': 'no-store',
      'X-Export-Id': exportId,
    },
  });
}
