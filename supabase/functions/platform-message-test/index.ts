import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSms, sendWhatsapp } from '../_shared/message-providers.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(url, serviceKey);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: cors });
}

async function audit(
  operation: 'INSERT' | 'UPDATE',
  actor: string,
  rowId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    actor,
    table_name: 'platform_message_test',
    operation,
    row_id: rowId,
    new_data: data,
  });
  if (error) throw new Error(`audit_failed: ${error.message}`);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const authHeader = request.headers.get('Authorization') ?? '';
  const userDb = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth, error: authError } = await userDb.auth.getUser();
  if (authError || !auth.user) return response({ error: 'not_authorized' }, 401);
  const { error: adminError } = await userDb.rpc('assert_platform_admin');
  if (adminError) return response({ error: 'platform_admin_required' }, 403);
  const input = (await request.json().catch(() => null)) as {
    channel?: unknown;
    recipient?: unknown;
    body?: unknown;
  } | null;
  const channel = typeof input?.channel === 'string' ? input.channel : '';
  const recipient = typeof input?.recipient === 'string' ? input.recipient.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  if (
    !['sms', 'whatsapp'].includes(channel ?? '') ||
    !/^\+?[1-9]\d{7,14}$/.test(recipient) ||
    !body ||
    body.length > 2000
  ) {
    return response({ error: 'invalid_test_message' }, 400);
  }
  const testId = crypto.randomUUID();
  const auditData = { channel, recipient_suffix: recipient.slice(-4), body_length: body.length };
  try {
    await audit('INSERT', auth.user.id, testId, { ...auditData, outcome: 'attempted' });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'audit_failed' }, 500);
  }
  try {
    if (channel === 'sms') await sendSms(recipient, body);
    else await sendWhatsapp(recipient, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider_failed';
    await audit('UPDATE', auth.user.id, testId, {
      ...auditData,
      outcome: 'failed',
      error: message,
    }).catch(auditError => console.error(auditError));
    return response({ error: message }, 502);
  }
  const auditRecorded = await audit('UPDATE', auth.user.id, testId, {
    ...auditData,
    outcome: 'provider_accepted',
  })
    .then(() => true)
    .catch(error => {
      console.error(error);
      return false;
    });
  return response({ accepted: true, audit_recorded: auditRecorded });
});
