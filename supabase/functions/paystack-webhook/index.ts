// paystack-webhook: receives Paystack events, activates subscriptions on
// verified charge.success. HMAC-SHA512 signature check on the raw body.
// Replaces archive/vendure/backend/src/plugins/subscriptions/subscription-webhook.controller.ts
// (charge.success is the only event with logic upstream; others are log-only).
//
// Env: PAYSTACK_WEBHOOK_SECRET, PAYSTACK_SECRET_KEY,
//      PAYSTACK_ONLINE_VERIFY ('false' skips the /transaction/verify callback
//      — local testing only; keep true in production).

import { createClient } from 'npm:@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('PAYSTACK_WEBHOOK_SECRET') ?? '';
const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const ONLINE_VERIFY = (Deno.env.get('PAYSTACK_ONLINE_VERIFY') ?? 'true') !== 'false';

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';

  const expected = await hmacHex(WEBHOOK_SECRET, rawBody);
  if (signature !== expected) {
    return Response.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.event !== 'charge.success') {
    // subscription.create/disable/not_renew are log-only upstream; ack and move on.
    return Response.json({ received: true });
  }

  const data = event.data ?? {};
  const meta = data.metadata ?? {};
  if (meta.type !== 'subscription') {
    return Response.json({ received: true, skipped: 'not a subscription charge' });
  }

  // Verify the transaction with Paystack before trusting it.
  if (ONLINE_VERIFY) {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const verifyBody = await verifyRes.json();
    if (!verifyRes.ok || !verifyBody.status || verifyBody.data?.status !== 'success') {
      return Response.json({ error: 'verification_failed' }, { status: 400 });
    }
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { error } = await serviceClient.rpc('activate_subscription', {
    p_company_id: meta.company_id,
    p_tier_id: meta.tier_id,
    p_billing_cycle: meta.billing_cycle,
    p_reference: data.reference,
    p_amount: Math.round(data.amount / 100), // Paystack sends cents; we store shillings
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ received: true, activated: meta.company_id });
});
