import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { connectToDatabase } from '@/lib/mongodb';
import { expireStaleHolds } from '@/lib/bookings';
import {
  clearRazorpayConfig,
  clearRazorpayWebhookSecret,
  detectMode,
  getRazorpayConfig,
  maskKeyId,
  maskSecret,
  saveRazorpayConfig,
  saveRazorpayWebhookSecret,
  setRazorpayEnabled,
  validateKeyId,
  validateKeySecret,
  validateWebhookSecret,
  verifyRazorpayCredentials,
  type RazorpayConfig,
} from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

/**
 * Management of the Razorpay credentials. This is high-risk configuration:
 * reading needs 'integrations:view' and every change 'integrations:manage',
 * which only a Super Admin holds unless it is granted to an admin explicitly.
 * The Finance role cannot see or change the keys.
 *
 * Neither the key secret nor the webhook secret is ever returned: only a
 * masked preview, so an admin can confirm which one is saved. Every change is
 * written to the activity log, without the secret values.
 */

function toPublicShape(config: RazorpayConfig) {
  return {
    provider: 'razorpay',
    keyId: config.keyId,
    keyIdMasked: maskKeyId(config.keyId),
    secretMasked: maskSecret(config.keySecret),
    secretSet: config.hasKeySecret,
    secretDecryptFailed: config.secretDecryptFailed,
    mode: config.mode,
    enabled: config.enabled,
    isConfigured: config.isConfigured,
    source: config.source,
    envFallbackAvailable: config.envFallbackAvailable,
    webhookSecretSet: config.hasWebhookSecret,
    webhookSecretMasked: maskSecret(config.webhookSecret),
    webhookSecretSource: config.webhookSecretSource,
    webhookSecretDecryptFailed: config.webhookSecretDecryptFailed,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

/**
 * What the audit log keeps about the gateway state. No secret values. The
 * field names avoid the word "secret" on purpose: the audit log blanks any
 * field with that word in its name, which would also hide these yes/no facts.
 */
function auditShape(config: RazorpayConfig) {
  return {
    keyId: maskKeyId(config.keyId),
    mode: config.mode,
    enabled: config.enabled,
    source: config.source,
    privateKeySaved: config.hasKeySecret,
    webhookSigningKeySaved: config.hasWebhookSecret,
  };
}

/** What switching payments off would affect right now (requirements section 20). */
async function shutdownImpact() {
  const { db } = await connectToDatabase();
  await expireStaleHolds(db);
  const [pendingPayments, confirmedBookings, refundsInProgress, settlementsInProgress, lastWebhook] = await Promise.all([
    db.collection('bookings').countDocuments({ status: 'pending_payment', source: 'order' }),
    db.collection('bookings').countDocuments({ status: 'confirmed' }),
    db.collection('refunds').countDocuments({
      status: { $in: ['requested', 'awaiting_second_approval', 'approved', 'processing'] },
    }),
    db.collection('settlements').countDocuments({ status: { $in: ['pending', 'awaiting_second_approval', 'approved'] } }),
    db
      .collection('webhookEvents')
      .find({ provider: 'razorpay' })
      .sort({ receivedAt: -1 })
      .limit(1)
      .project({ event: 1, signatureValid: 1, processed: 1, error: 1, receivedAt: 1 })
      .next(),
  ]);
  return { pendingPayments, confirmedBookings, refundsInProgress, settlementsInProgress, lastWebhook: lastWebhook || null };
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:view');
  if (!check.ok) return check.response;

  try {
    const config = await getRazorpayConfig();
    return NextResponse.json(
      { success: true, config: toPublicShape(config), impact: await shutdownImpact() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/settings/payment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load payment gateway settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  try {
    const body = await request.json().catch(() => ({}));
    const { keyId, keySecret, enabled, force, skipVerify, webhookSecret, removeWebhookSecret, confirm } = body ?? {};
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    // Every change to the payment gateway is logged with why it was made.
    if (reason.length < 5) {
      return NextResponse.json(
        { success: false, code: 'REASON_REQUIRED', error: 'Give a reason of at least 5 characters for this change to the payment gateway.' },
        { status: 400 }
      );
    }
    const existing = await getRazorpayConfig();

    // Webhook secret only.
    if (keyId === undefined && keySecret === undefined && (webhookSecret !== undefined || removeWebhookSecret === true)) {
      if (removeWebhookSecret === true) {
        const updated = await clearRazorpayWebhookSecret(admin.email || null);
        await logAudit({
          admin,
          action: 'webhook_secret_remove',
          module: 'finance',
          entityType: 'paymentGateway',
          entityId: 'razorpay',
          entityLabel: 'Razorpay',
          before: auditShape(existing),
          after: auditShape(updated),
          reason,
          request,
        });
        return NextResponse.json({
          success: true,
          config: toPublicShape(updated),
          message: updated.hasWebhookSecret
            ? 'Saved webhook secret removed. The server environment value is used now.'
            : 'Webhook secret removed. Razorpay webhooks will be refused until a new one is saved.',
        });
      }

      const secretCheck = validateWebhookSecret(webhookSecret);
      if (!secretCheck.valid) {
        return NextResponse.json({ success: false, error: secretCheck.error }, { status: 400 });
      }
      const updated = await saveRazorpayWebhookSecret(String(webhookSecret), admin.email || null);
      await logAudit({
        admin,
        action: existing.webhookSecretSource === 'database' ? 'webhook_secret_rotate' : 'webhook_secret_save',
        module: 'finance',
        entityType: 'paymentGateway',
        entityId: 'razorpay',
        entityLabel: 'Razorpay',
        before: auditShape(existing),
        after: auditShape(updated),
        reason,
        request,
      });
      return NextResponse.json({ success: true, config: toPublicShape(updated), message: 'Webhook secret saved' });
    }

    // Enable / disable toggle only - no credential changes.
    if (keyId === undefined && keySecret === undefined && typeof enabled === 'boolean') {
      if (enabled && !existing.hasKeyId) {
        return NextResponse.json(
          { success: false, error: 'Save a valid Key ID and Key Secret before enabling Razorpay.' },
          { status: 400 }
        );
      }

      // Switching payments off needs an explicit confirmation after seeing
      // what it affects. The check is made here, not only on the screen.
      if (!enabled && existing.enabled && confirm !== true) {
        return NextResponse.json(
          {
            success: false,
            code: 'CONFIRM_REQUIRED',
            error: 'Confirm that online payments should be switched off.',
            impact: await shutdownImpact(),
          },
          { status: 409 }
        );
      }

      // The reason is part of the record of a shutdown, so it is required here too.
      if (!enabled && existing.enabled && reason.length < 5) {
        return NextResponse.json(
          { success: false, code: 'REASON_REQUIRED', error: 'Give a reason of at least 5 characters for switching online payments off.' },
          { status: 400 }
        );
      }

      const impact = !enabled ? await shutdownImpact() : null;
      const updated = await setRazorpayEnabled(enabled, admin.email || null);
      await logAudit({
        admin,
        action: enabled ? 'payments_enable' : 'payments_disable',
        module: 'finance',
        entityType: 'paymentGateway',
        entityId: 'razorpay',
        entityLabel: 'Razorpay',
        before: { enabled: existing.enabled },
        after: { enabled: updated.enabled },
        reason,
        request,
        meta: impact
          ? {
              pendingPayments: impact.pendingPayments,
              confirmedBookings: impact.confirmedBookings,
              refundsInProgress: impact.refundsInProgress,
              settlementsInProgress: impact.settlementsInProgress,
            }
          : undefined,
      });
      return NextResponse.json({
        success: true,
        config: toPublicShape(updated),
        message: enabled ? 'Online payments are switched on' : 'Online payments are switched off',
      });
    }

    const keyIdCheck = validateKeyId(keyId);
    if (!keyIdCheck.valid) {
      return NextResponse.json({ success: false, error: keyIdCheck.error }, { status: 400 });
    }

    const trimmedKeyId = String(keyId).trim();
    const providedSecret = typeof keySecret === 'string' ? keySecret.trim() : '';

    // The secret is optional on update: when left blank we keep the stored one.
    // It is mandatory the first time, and whenever the key id changes.
    let effectiveSecret = providedSecret;

    if (!providedSecret) {
      const keyIdChanged = existing.keyId !== trimmedKeyId;
      const storedSecretUsable = existing.source === 'database' && existing.hasKeySecret;

      if (keyIdChanged || !storedSecretUsable) {
        return NextResponse.json(
          {
            success: false,
            error: existing.secretDecryptFailed
              ? 'The stored Key Secret could not be read. Please enter it again.'
              : 'Razorpay Key Secret is required',
          },
          { status: 400 }
        );
      }

      effectiveSecret = existing.keySecret;
    } else {
      const secretCheck = validateKeySecret(providedSecret);
      if (!secretCheck.valid) {
        return NextResponse.json({ success: false, error: secretCheck.error }, { status: 400 });
      }
    }

    // Verify the pair against Razorpay before persisting it, unless the admin
    // explicitly asked us to skip or force.
    let verification = null;

    if (!skipVerify) {
      verification = await verifyRazorpayCredentials(trimmedKeyId, effectiveSecret);

      if (!verification.valid && verification.invalidCredentials && !force) {
        return NextResponse.json(
          { success: false, error: verification.message, verification, canForce: true },
          { status: 400 }
        );
      }
    }

    const saved = await saveRazorpayConfig({
      keyId: trimmedKeyId,
      keySecret: providedSecret || undefined,
      // Saving keys never changes the on/off switch: that has its own confirmation.
      enabled: existing.enabled,
      updatedBy: admin.email || null,
    });

    await logAudit({
      admin,
      action: existing.source === 'database' ? 'keys_update' : 'keys_save',
      module: 'finance',
      entityType: 'paymentGateway',
      entityId: 'razorpay',
      entityLabel: 'Razorpay',
      before: auditShape(existing),
      after: auditShape(saved),
      reason,
      request,
      meta: {
        privateKeyChanged: Boolean(providedSecret),
        verifiedWithRazorpay: verification ? verification.valid : null,
        savedWithoutVerification: Boolean(force || skipVerify),
      },
    });

    const modeLabel = detectMode(trimmedKeyId) === 'live' ? 'LIVE' : 'TEST';
    let message = 'Razorpay credentials saved (' + modeLabel + ' mode)';
    if (verification && !verification.valid) {
      message += '. Note: ' + verification.message;
    }

    return NextResponse.json({ success: true, config: toPublicShape(saved), verification, message });
  } catch (error) {
    console.error('POST /api/settings/payment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save payment gateway settings' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  try {
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (reason.length < 5) {
      return NextResponse.json(
        { success: false, code: 'REASON_REQUIRED', error: 'Give a reason of at least 5 characters for removing the gateway keys.' },
        { status: 400 }
      );
    }
    const existing = await getRazorpayConfig();
    const config = await clearRazorpayConfig(admin.email || null);

    await logAudit({
      admin,
      action: 'keys_remove',
      module: 'finance',
      entityType: 'paymentGateway',
      entityId: 'razorpay',
      entityLabel: 'Razorpay',
      before: auditShape(existing),
      after: auditShape(config),
      reason,
      request,
    });

    return NextResponse.json({
      success: true,
      config: toPublicShape(config),
      message: config.envFallbackAvailable
        ? 'Saved credentials removed. Falling back to the server environment keys.'
        : 'Saved credentials removed. Razorpay is no longer configured.',
    });
  } catch (error) {
    console.error('DELETE /api/settings/payment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove payment gateway settings' }, { status: 500 });
  }
}
