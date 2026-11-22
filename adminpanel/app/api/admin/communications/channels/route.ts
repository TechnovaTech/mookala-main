import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import {
  CHANNELS,
  LOG_COLLECTION,
  RECEIPT_COLLECTION,
  getChannelConfig,
  getChannelSummaries,
  isChannel,
  planChannelSave,
  saveChannelConfig,
  type SaveChannelInput,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

function inputOf(body: any): SaveChannelInput {
  return {
    provider: body.provider,
    secrets: body.secrets && typeof body.secrets === 'object' ? body.secrets : undefined,
    clearSecrets: body.clearSecrets,
    secret: body.secret,
    clearSecret: body.clearSecret,
    enabled: body.enabled,
    values: body.values && typeof body.values === 'object' ? body.values : undefined,
  };
}

/**
 * Channel settings with secrets masked, the last real provider response per
 * channel, the last delivery receipt per provider and the webhook addresses.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const channels = await getChannelSummaries(db);

    const lastResults = await Promise.all(
      CHANNELS.map(async (channel) => {
        // An entry the provider answered: it accepted it (acceptedAt) or refused it (failedAt without acceptedAt).
        const latest = await db
          .collection(LOG_COLLECTION)
          .find({ channel, $or: [{ acceptedAt: { $exists: true } }, { failedAt: { $exists: true } }] })
          .sort({ createdAt: -1 })
          .limit(1)
          .next();
        return [
          channel,
          latest ? { status: latest.acceptedAt ? 'accepted' : 'failed', error: latest.acceptedAt ? null : latest.error || null, at: latest.createdAt } : null,
        ] as const;
      })
    );
    const last = Object.fromEntries(lastResults);

    const receipts = await db
      .collection(RECEIPT_COLLECTION)
      .aggregate([{ $sort: { receivedAt: -1 } }, { $group: { _id: '$provider', at: { $first: '$receivedAt' }, event: { $first: '$event' }, count: { $sum: 1 } } }])
      .toArray();
    const lastReceipt = Object.fromEntries(receipts.map((r) => [r._id, { at: r.at, event: r.event, count: r.count }]));

    // The address this panel was reached on (behind a proxy: the forwarded host), for the provider settings.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
    const proto = (request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')).split(',')[0].trim();
    const origin = `${proto}://${host}`;
    const webhooks: Record<string, { label: string; url: string; note: string }[]> = {
      email: [
        {
          label: 'SendGrid event webhook',
          url: `${origin}/api/public/webhooks/sendgrid`,
          note: 'Switch on "Signed Event Webhook" in SendGrid and save its verification key here. Without a key, add ?key= and the webhook URL key you saved.',
        },
        { label: 'Resend webhook', url: `${origin}/api/public/webhooks/resend`, note: 'Save the webhook signing secret (whsec_...) Resend shows.' },
      ],
      whatsapp: [
        {
          label: 'Meta webhook (callback URL)',
          url: `${origin}/api/public/webhooks/whatsapp`,
          note: 'Use the verify token saved here, subscribe to the "messages" field, and save the app secret so status updates can be checked.',
        },
      ],
    };

    return ok({
      channels: channels.map((c) => ({
        ...c,
        lastProviderResult: last[c.channel],
        lastReceipt: c.channel === 'email' ? lastReceipt[c.provider] || null : c.channel === 'whatsapp' ? lastReceipt.meta || null : null,
        webhooks: webhooks[c.channel] || [],
      })),
      // Provider keys are high-risk configuration: Super Admin, or an admin granted `integrations`.
      canManage: can(check.admin, 'integrations:manage'),
    });
  } catch (error) {
    console.error('Load channels failed:', error);
    return fail('Failed to load the channel settings', 500);
  }
}

/** Saves one channel. A secret is only replaced when a new one is typed. */
export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');
    if (!isChannel(body.channel)) return fail('Unknown channel');

    const { db } = await connectToDatabase();
    const reason = asString(body.reason, 500);
    // Every change to a provider key or channel is logged with why it was made.
    if (reason.length < 5) return fail('A written reason (at least 5 characters) is required to change a notification channel.');

    const input = inputOf(body);
    const current = await getChannelConfig(db, body.channel);
    const plan = planChannelSave(current, input);
    if (!plan.ok) return fail(plan.error);

    // A second approver, when the security settings ask for one ("notification_keys").
    const changes = diff(plan.before, plan.after);
    const label = (await getChannelSummaries(db)).find((c) => c.channel === body.channel)?.label || body.channel;
    let approval: any = null;
    if (Object.keys(changes.after).length > 0) {
      const { approvalId: _ignored, ...replayBody } = body as Record<string, any>;
      const gate = await gateSensitiveAction(db, {
        action: 'notification_keys',
        admin: check.admin,
        entityType: 'notification-channel',
        entityId: body.channel,
        entityLabel: label,
        before: changes.before,
        after: changes.after,
        payload: {
          channel: body.channel,
          provider: plan.provider,
          enabled: plan.enabled,
          values: plan.values,
          clearSecrets: plan.clearSecrets,
          // Only fingerprints of new secrets go into the hash.
          secrets: plan.fingerprints,
        },
        reason,
        approvalId: asString(body.approvalId, 40) || null,
        replay: { method: 'PUT', path: '/api/admin/communications/channels', body: replayBody },
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
      if (!gate.proceed) return approvalHeldResponse(gate);
      approval = gate.approval;
    }

    const saved = await saveChannelConfig(db, body.channel, input, check.admin.email || null);
    if (!saved.ok) return fail(saved.error);

    // The audit entry says whether each secret changed, never what it is.
    const recorded = diff(saved.before, saved.after);
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'communications',
      entityType: 'notification-channel',
      entityId: body.channel,
      entityLabel: saved.summary.label,
      before: recorded.before,
      after: recorded.after,
      meta: {
        credentialChanged: saved.credentialChanged,
        changedSettingsWithValuesHidden: saved.secretsChanged.length,
        ...(approval ? { approvalId: String(approval._id), requestedBy: approval.requestedBy, approvedBy: approval.decidedBy } : {}),
      },
      reason: reason || null,
      request,
    });

    return ok({ channel: saved.summary });
  } catch (error) {
    console.error('Save channel failed:', error);
    return fail('Failed to save the channel settings', 500);
  }
}
