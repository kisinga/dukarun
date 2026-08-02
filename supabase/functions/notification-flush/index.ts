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

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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
    body: JSON.stringify({ apikey: apiKey, partnerID, message: body, shortcode, mobile: kePhone(recipient) }),
  });
  if (!res.ok) throw new Error(`textsms http ${res.status}`);

  const result = await res.json().catch(() => null);
  const code = result?.responses?.[0]?.['respose-code'] ?? result?.responses?.[0]?.['response-code'];
  if (code !== undefined && code !== 200) {
    throw new Error(`textsms code ${code}: ${result?.responses?.[0]?.['response-description'] ?? ''}`);
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const { data: rows, error } = await db
    .from('outbox')
    .select('id, company_id, channel, recipient, subject, body, attempts')
    .eq('status', 'pending')
    .lte('scheduled_after', new Date().toISOString())
    .order('scheduled_after', { ascending: true })
    .limit(BATCH);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      if (row.channel === 'sms') await sendSms(row.recipient, row.body);
      else if (row.channel === 'whatsapp') await sendWhatsapp(row.recipient, row.body);
      else await sendEmail(row.recipient, row.subject, row.body);

      await db
        .from('outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq('id', row.id);

      // SMS metering against the tier's smsPerPeriod.
      if (row.channel === 'sms') {
        await db.rpc('increment_sms_usage', { p_company_id: row.company_id });
      }
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

  return Response.json({ processed: (rows ?? []).length, sent, failed });
});
