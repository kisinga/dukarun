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

const BATCH = 50;
const MAX_ATTEMPTS = 5;
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

function kePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits.startsWith('0') ? '254' + digits.slice(1) : digits.replace(/^\+/, '');
}

async function sendSms(recipient: string, body: string): Promise<void> {
  const apiKey = Deno.env.get('TEXTSMS_API_KEY');
  const partnerID = Deno.env.get('TEXTSMS_PARTNER_ID');
  const shortcode = Deno.env.get('TEXTSMS_SHORTCODE');
  if (!apiKey || !partnerID || !shortcode) throw new Error('provider_not_configured: textsms');

  const res = await fetch('https://sms.textsms.co.ke/api/services/sendsms/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apikey: apiKey,
      partnerID,
      message: body,
      shortcode,
      mobile: kePhone(recipient),
    }),
  });
  if (!res.ok) throw new Error(`textsms http ${res.status}`);

  const result = await res.json().catch(() => null);
  const code =
    result?.responses?.[0]?.['respose-code'] ?? result?.responses?.[0]?.['response-code'];
  if (code !== undefined && code !== 200) {
    throw new Error(
      `textsms code ${code}: ${result?.responses?.[0]?.['response-description'] ?? ''}`
    );
  }
}

async function sendWhatsapp(recipient: string, body: string): Promise<void> {
  const baseUrl = Deno.env.get('OPENWA_BASE_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const session = Deno.env.get('OPENWA_SESSION') ?? 'default';
  if (!baseUrl || !apiKey) throw new Error('provider_not_configured: openwa');

  const res = await fetch(`${baseUrl}/api/sessions/${session}/messages/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ chatId: `${kePhone(recipient)}@s.whatsapp.net`, text: body }),
  });
  if (!res.ok) throw new Error(`openwa http ${res.status}`);
}

async function sendEmail(recipient: string, subject: string | null, body: string): Promise<void> {
  const apiUrl = Deno.env.get('EMAIL_API_URL');
  const apiKey = Deno.env.get('EMAIL_API_KEY');
  if (!apiUrl || !apiKey) throw new Error('provider_not_configured: email');

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Dukarun <no-reply@dukarun.com>',
      to: recipient,
      subject: subject ?? 'Dukarun notification',
      text: body,
    }),
  });
  if (!res.ok) throw new Error(`email http ${res.status}`);
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
    .select('id, company_id, channel, recipient, subject, body, attempts')
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
    // A crash between claim and send burns an attempt without reaching the
    // catch path, so a row can arrive here already exhausted; fail it instead
    // of re-claiming it forever.
    if (row.attempts >= MAX_ATTEMPTS) {
      await db
        .from('outbox')
        .update({ status: 'failed', attempts: row.attempts + 1, error: 'max_attempts_exceeded' })
        .eq('id', row.id);
      failed++;
      continue;
    }
    try {
      if (row.channel === 'sms') await sendSms(row.recipient, row.body);
      else if (row.channel === 'whatsapp') await sendWhatsapp(row.recipient, row.body);
      else await sendEmail(row.recipient, row.subject, row.body);

      await db
        .from('outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq('id', row.id);

      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'send failed';
      const attempts = row.attempts + 1;
      await db
        .from('outbox')
        .update({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          error: message,
          // backoff: retry in attempts^2 minutes
          scheduled_after: new Date(Date.now() + attempts * attempts * 60_000).toISOString(),
        })
        .eq('id', row.id);
      failed++;
    }
  }

  return Response.json({ processed: rows.length, sent, failed });
});
