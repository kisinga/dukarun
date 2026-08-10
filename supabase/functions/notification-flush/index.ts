// notification-flush: drains due outbox rows (batch of 50) to external
// providers. Called every minute by pg_cron -> pg_net (service role).
//
// Providers:
//   sms      -> TextSMS (sendsms endpoint; OTPs go through the auth hook)
//   whatsapp -> self-hosted OpenWA gateway
//   email    -> HTTPS API (EMAIL_API_URL; SMTP ports are blocked here)
//
// Env: TEXTSMS_API_KEY / TEXTSMS_PARTNER_ID / TEXTSMS_SHORTCODE,
//      OPENWA_BASE_URL / OPENWA_API_KEY / OPENWA_SESSION,
//      EMAIL_API_URL / EMAIL_API_KEY / EMAIL_FROM

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  DeliveryError,
  requestProvider,
  sendSms,
  sendWhatsapp,
} from '../_shared/message-providers.ts';

const BATCH = 50;
const DEFAULT_MAX_ATTEMPTS = 5;
// Claim lease: exceeds the 1-minute flush interval so an in-flight send is
// never re-claimed; a crashed batch becomes retryable once it expires.
const LEASE_MS = 5 * 60_000;

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function authorized(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const actual = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function sendEmail(recipient: string, subject: string | null, body: string): Promise<void> {
  const apiUrl = Deno.env.get('EMAIL_API_URL');
  const apiKey = Deno.env.get('EMAIL_API_KEY');
  if (!apiUrl || !apiKey) {
    throw new DeliveryError('provider_not_configured: email', true, false);
  }

  await requestProvider(
    apiUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'Dukarun <no-reply@dukarun.com>',
        to: recipient,
        subject: subject ?? 'Dukarun notification',
        text: body,
      }),
    },
    'email'
  );
}

async function tryFinalizeCampaignRecipient(
  row: { campaign_id?: string | null; campaign_recipient_id?: string | null },
  status: 'sent' | 'failed'
): Promise<void> {
  if (!row.campaign_id || !row.campaign_recipient_id) return;
  const { error } = await db.rpc('finalize_campaign_recipient', {
    p_recipient_id: row.campaign_recipient_id,
    p_status: status,
  });
  if (error) {
    console.error('campaign recipient finalization failed', row.campaign_recipient_id, error);
  }
}

async function queueFallback(row: {
  id: string;
  company_id: string;
  customer_id?: string | null;
  recipient: string;
  fallback_body?: string | null;
  fallback_channel?: string | null;
}): Promise<void> {
  if (row.fallback_channel !== 'sms') return;
  if (!row.fallback_body) {
    await db.rpc('notify', {
      p_company_id: row.company_id,
      p_type: 'credit_reminder',
      p_title: 'Reminder fallback not sent',
      p_body: 'The SMS fallback template is empty.',
      p_link: '/messaging',
    });
    return;
  }
  if (row.customer_id) {
    const { data: customer } = await db
      .from('customers')
      .select('notifications_enabled, sms_notifications_enabled')
      .eq('id', row.customer_id)
      .eq('company_id', row.company_id)
      .maybeSingle();
    if (!customer?.notifications_enabled || !customer.sms_notifications_enabled) {
      await db.rpc('notify', {
        p_company_id: row.company_id,
        p_type: 'credit_reminder',
        p_title: 'Reminder fallback not sent',
        p_body: 'Customer has opted out of SMS.',
        p_link: '/messaging',
      });
      return;
    }
  }
  const { data: outboxId, error } = await db.rpc('queue_sms_fallback', {
    p_outbox_id: row.id,
  });
  if (error || !outboxId) {
    await db.rpc('notify', {
      p_company_id: row.company_id,
      p_type: 'credit_reminder',
      p_title: 'Reminder fallback not sent',
      p_body: error?.message ?? 'SMS fallback could not be queued',
      p_link: '/messaging',
    });
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  if (!authorized(req)) {
    return Response.json({ error: 'not_authorized' }, { status: 401 });
  }

  const { data: candidates, error } = await db
    .from('outbox')
    .select(
      'id, company_id, channel, recipient, subject, body, attempts, max_attempts, campaign_id, campaign_recipient_id, customer_id, source, template_key, template_version, quota_state, fallback_channel, fallback_body'
    )
    .eq('status', 'pending')
    .lte('scheduled_after', new Date().toISOString())
    .order('scheduled_after', { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error('outbox select failed', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }

  // Claim rows before sending so concurrent invocations don't double-send.
  // The status check constraint only allows pending/sent/failed, so we claim
  // optimistically: increment attempts guarded on the exact (id, status,
  // attempts) values we read — a concurrent flush that already claimed the row
  // makes this update match nothing, and we skip it. The claim also pushes
  // scheduled_after out by a lease: without it a second flush starting while
  // a send is still in flight re-matches the row on its new attempts value
  // and double-sends. A crashed batch leaves rows retryable after the lease.
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const rows = [];
  for (const row of candidates ?? []) {
    if (row.campaign_id) {
      const { data: campaign } = await db
        .from('message_campaigns')
        .select('status')
        .eq('id', row.campaign_id)
        .maybeSingle();
      if (campaign?.status === 'paused' || campaign?.status === 'cancelled') continue;
    }
    const { data: claimed } = await db
      .from('outbox')
      .update({ attempts: row.attempts + 1, scheduled_after: leaseUntil })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('attempts', row.attempts)
      .select('id');
    if (claimed && claimed.length > 0) rows.push(row);
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    // Cancellation or consent revocation may race with the claim. Re-read the
    // durable state immediately before invoking an external provider.
    const { data: current } = await db
      .from('outbox')
      .select('status')
      .eq('id', row.id)
      .maybeSingle();
    if (current?.status !== 'pending') continue;

    // Customer reminders and fixed document deliveries must re-check the
    // platform/company controls at the last possible moment. The RPC also
    // cancels a disallowed pending row and releases its quota reservation.
    const { data: deliveryAllowed, error: policyError } = await db.rpc(
      'prepare_controlled_outbox_delivery',
      { p_outbox_id: row.id }
    );
    if (policyError) {
      console.error('outbox policy check failed', row.id, policyError);
      continue; // fail closed; the lease makes the row retryable
    }
    if (!deliveryAllowed) continue;

    // A crash between claim and send burns an attempt without reaching the
    // catch path, so a row can arrive here already exhausted; fail it instead
    // of re-claiming it forever.
    const maxAttempts = row.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
    if (row.attempts >= maxAttempts) {
      await db.rpc('finalize_message_quota', { p_outbox_id: row.id, p_accepted: false });
      const { data: updated } = await db
        .from('outbox')
        .update({ status: 'failed', attempts: row.attempts + 1, error: 'max_attempts_exceeded' })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');
      if (updated?.length) {
        failed++;
        await tryFinalizeCampaignRecipient(row, 'failed');
        await queueFallback(row);
      }
      continue;
    }
    try {
      if (row.channel === 'sms') await sendSms(row.recipient, row.body);
      else if (row.channel === 'whatsapp') await sendWhatsapp(row.recipient, row.body);
      else await sendEmail(row.recipient, row.subject, row.body);

      await db.rpc('finalize_message_quota', { p_outbox_id: row.id, p_accepted: true });

      await db.from('delivery_attempts').insert({
        outbox_id: row.id,
        provider: row.channel,
        attempt_number: row.attempts + 1,
        accepted: true,
        response_status: 200,
      });

      const { data: updated } = await db
        .from('outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');

      if (updated?.length) {
        sent++;
        await tryFinalizeCampaignRecipient(row, 'sent');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'send failed';
      const attempts = row.attempts + 1;
      const deliveryError =
        err instanceof DeliveryError ? err : new DeliveryError(message, false, true);
      const terminal = deliveryError.permanent || attempts >= maxAttempts;
      if (deliveryError.accepted) {
        await db.rpc('finalize_message_quota', { p_outbox_id: row.id, p_accepted: true });
      } else if (terminal) {
        await db.rpc('finalize_message_quota', { p_outbox_id: row.id, p_accepted: false });
      }
      await db.from('delivery_attempts').insert({
        outbox_id: row.id,
        provider: row.channel,
        attempt_number: attempts,
        accepted: deliveryError.accepted,
        error: message,
      });
      const { data: updated } = await db
        .from('outbox')
        .update({
          status: terminal ? 'failed' : 'pending',
          attempts,
          error: message,
          // backoff: retry in attempts^2 minutes
          scheduled_after: new Date(Date.now() + attempts * attempts * 60_000).toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id');
      if (updated?.length) failed++;
      if (terminal && updated?.length) {
        await tryFinalizeCampaignRecipient(row, 'failed');
        await queueFallback(row);
      }
    }
  }

  return Response.json({ processed: rows.length, sent, failed });
});
