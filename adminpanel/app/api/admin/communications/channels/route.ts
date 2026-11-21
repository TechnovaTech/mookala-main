import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import { CHANNELS, LOG_COLLECTION, getChannelSummaries, isChannel, saveChannelConfig } from '@/lib/notifications';

/** "otpTemplateName" would be hidden by the audit filter because of "otp" in its name. */
const viewKey = (key: string) => (key === 'otpTemplateName' ? 'smsTemplateName' : key);

/**
 * The checks saveChannelConfig (lib/notifications.ts) makes, run before a
 * change is sent for approval so that an approver is never asked to agree to
 * a change that would then be refused. saveChannelConfig checks again.
 */
function preflight(current: any, body: any): string | null {
  const provider = current.providerFixed ? current.provider : String(body.provider ?? current.provider ?? '').trim().toLowerCase();
  if (provider && !/^[a-z0-9 _.-]+$/.test(provider)) return 'Provider name has characters that are not allowed';
  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  if (secret && /\s/.test(secret)) return `${current.label}: the key must not contain spaces`;
  const value = (key: string) => {
    const field = current.fields.find((item: any) => item.key === key);
    if (!field) return '';
    return String(body.values && typeof body.values === 'object' && key in body.values ? body.values[key] ?? '' : field.value || '').trim();
  };
  if (current.channel === 'sms' && value('otpTemplateName') && !/^[A-Za-z0-9 _-]+$/.test(value('otpTemplateName'))) {
    return 'OTP template name may only contain letters, numbers, spaces, hyphens and underscores';
  }
  if (current.channel === 'email' && value('fromAddress') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('fromAddress'))) {
    return 'From address is not a valid email address';
  }
  const enabled = body.enabled === undefined ? current.enabled : body.enabled === true;
  const willHaveSecret = body.clearSecret === true ? false : Boolean(secret) || current.hasSecret;
  if (enabled && !willHaveSecret) return `Save the ${current.secretLabel.toLowerCase()} before switching this channel on`;
  return null;
}

/**
 * The channel as it is and as this request would leave it, without any key,
 * for the approver and the activity log.
 */
function proposedChange(current: any, body: any) {
  const values: Record<string, string> = Object.fromEntries(current.fields.map((field: any) => [field.key, field.value || '']));
  const nextValues: Record<string, string> = { ...values };
  if (body.values && typeof body.values === 'object') {
    for (const key of Object.keys(values)) if (key in body.values) nextValues[key] = String(body.values[key] ?? '').trim();
  }
  const newSecret = typeof body.secret === 'string' ? body.secret.trim() : '';
  const clear = body.clearSecret === true;
  const before = {
    provider: current.provider,
    enabled: current.enabled,
    credentialSaved: current.hasSecret,
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [viewKey(key), value])),
  };
  const after = {
    provider: current.providerFixed ? current.provider : String(body.provider ?? current.provider ?? '').trim().toLowerCase(),
    enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
    credentialSaved: clear ? false : Boolean(newSecret) || current.hasSecret,
    ...Object.fromEntries(Object.entries(nextValues).map(([key, value]) => [viewKey(key), value])),
  };
  const changes = diff(before, after);
  if (newSecret) {
    changes.before.credential = current.hasSecret ? 'a key is saved' : 'no key';
    changes.after.credential = 'replaced with a new key';
  }
  return { changes, newSecret, clear };
}

export const dynamic = 'force-dynamic';

/** Channel settings with secrets masked, plus the last real provider response per channel. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const channels = await getChannelSummaries(db);

    const lastResults = await Promise.all(
      CHANNELS.map(async (channel) => {
        const entry = await db
          .collection(LOG_COLLECTION)
          .find({ channel, status: { $in: ['accepted', 'failed'] } })
          .sort({ createdAt: -1 })
          .limit(1)
          .next();
        return [channel, entry ? { status: entry.status, error: entry.error || null, at: entry.createdAt } : null] as const;
      })
    );
    const last = Object.fromEntries(lastResults);

    return ok({
      channels: channels.map((c) => ({ ...c, lastProviderResult: last[c.channel] })),
      // Provider keys are high-risk configuration: Super Admin, or an admin granted `integrations`.
      canManage: can(check.admin, 'integrations:manage'),
    });
  } catch (error) {
    console.error('Load channels failed:', error);
    return fail('Failed to load the channel settings', 500);
  }
}

/** Saves one channel. The secret is only replaced when a new one is typed. */
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

    // A second approver, when the security settings ask for one ("notification_keys").
    const current = (await getChannelSummaries(db)).find((item) => item.channel === body.channel)!;
    const problem = preflight(current, body);
    if (problem) return fail(problem);
    const proposal = proposedChange(current, body);
    let approval: any = null;
    if (Object.keys(proposal.changes.after).length > 0) {
      const { approvalId: _ignored, ...replayBody } = body as Record<string, any>;
      const gate = await gateSensitiveAction(db, {
        action: 'notification_keys',
        admin: check.admin,
        entityType: 'notification-channel',
        entityId: body.channel,
        entityLabel: current.label,
        before: proposal.changes.before,
        after: proposal.changes.after,
        payload: {
          channel: body.channel,
          provider: body.provider ?? null,
          enabled: body.enabled ?? null,
          values: body.values ?? null,
          clearSecret: proposal.clear,
          // Only a fingerprint of a new key goes into the hash.
          secret: proposal.newSecret ? crypto.createHash('sha256').update(proposal.newSecret).digest('hex') : null,
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

    const saved = await saveChannelConfig(
      db,
      body.channel,
      {
        provider: body.provider,
        secret: body.secret,
        clearSecret: body.clearSecret,
        enabled: body.enabled,
        values: body.values && typeof body.values === 'object' ? body.values : undefined,
      },
      check.admin.email || null
    );
    if (!saved.ok) return fail(saved.error);

    // The audit entry says whether the credential changed, never what it is.
    const changes = diff(saved.before, saved.after);
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'communications',
      entityType: 'notification-channel',
      entityId: body.channel,
      entityLabel: saved.summary.label,
      before: changes.before,
      after: changes.after,
      meta: {
        credentialChanged: saved.credentialChanged,
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
