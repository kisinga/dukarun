import { createClient } from 'npm:@supabase/supabase-js@2';
import { processSaleDocument } from '../_shared/sale-document-delivery.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const respond = (body: unknown, status: number) => Response.json(body, { status, headers: cors });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: auth, error: authError } = await userDb.auth.getUser();
  if (authError || !auth.user) return respond({ error: 'not_authorized' }, 401);
  const input = await request.json().catch(() => null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !input ||
    !uuid.test(input.order_id ?? '') ||
    !uuid.test(input.request_key ?? '') ||
    [input.phone, input.first_name, input.last_name].some(
      v => v != null && (typeof v !== 'string' || v.length > 100)
    )
  )
    return respond({ error: 'invalid_request' }, 400);
  const { data, error } = await userDb.rpc('request_sale_document', {
    p_order_id: input.order_id,
    p_request_key: input.request_key,
    p_phone: input.phone ?? null,
    p_first_name: input.first_name ?? null,
    p_last_name: input.last_name ?? null,
  });
  if (error) return respond({ error: error.message }, 400);
  // Acceptance is durable before responding. Scheduled notification-flush recovers any missed wake-up.
  EdgeRuntime.waitUntil(
    processSaleDocument(db, data.outbox_id).catch(() => console.error('sale_document_wake_failed'))
  );
  return respond(data, 202);
});
