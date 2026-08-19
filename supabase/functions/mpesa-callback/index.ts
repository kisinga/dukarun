import { createClient } from 'npm:@supabase/supabase-js@2';
import { sha256 } from '../_shared/mpesa.ts';

const accepted = () => Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const token = url.searchParams.get('token') ?? '';
  const eventType = {
    stk: 'stk_callback',
    'c2b-validation': 'c2b_validation',
    'c2b-confirmation': 'c2b_confirmation',
  }[kind ?? ''];
  if (!token || !eventType)
    return Response.json({ error: 'invalid_callback_url' }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  let eventKey: string;
  if (eventType === 'stk_callback') {
    const callback = (payload.Body as Record<string, unknown> | undefined)?.stkCallback as
      Record<string, unknown> | undefined;
    eventKey = String(callback?.CheckoutRequestID ?? '');
    if (!eventKey) return Response.json({ error: 'invalid_stk_callback' }, { status: 400 });
  } else {
    eventKey = String(payload.TransID ?? '');
    if (!eventKey) eventKey = await sha256(JSON.stringify(payload));
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const serialized = JSON.stringify(payload);
  const { error } = await db.rpc('mpesa_ingest_provider_event', {
    p_token_hash: await sha256(token),
    p_event_type: eventType,
    p_event_key: eventKey,
    p_payload: payload,
    p_payload_sha256: await sha256(serialized),
  });
  // Safaricom should retry when durable storage was not confirmed.
  if (error) {
    const status = error.message.includes('invalid_or_expired_callback_token') ? 404 : 503;
    return Response.json(
      { error: status === 404 ? 'callback_not_found' : 'callback_storage_failed' },
      { status }
    );
  }
  return accepted();
});
