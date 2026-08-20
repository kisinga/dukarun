import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  DeliveryError,
  normalizeWhatsappPhone,
  sendWhatsappImage,
} from '../_shared/message-providers.ts';
import {
  platformSalesInvitationCaption,
  platformSalesInvitationUrl,
} from '../_shared/sales-invitation.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const appPublicUrl = (Deno.env.get('APP_PUBLIC_URL') ?? 'https://app.dukarun.com').replace(
  /\/+$/,
  ''
);
const db = createClient(url, serviceKey);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: cors });
}

function isValidPngBase64(value: string): boolean {
  if (!value || value.length > 1_000_000 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const bytes = atob(value);
    return (
      bytes.length <= 750_000 &&
      bytes.length >= 8 &&
      bytes.charCodeAt(0) === 0x89 &&
      bytes.slice(1, 4) === 'PNG' &&
      bytes.charCodeAt(4) === 0x0d &&
      bytes.charCodeAt(5) === 0x0a &&
      bytes.charCodeAt(6) === 0x1a &&
      bytes.charCodeAt(7) === 0x0a
    );
  } catch {
    return false;
  }
}

async function audit(
  operation: 'INSERT' | 'UPDATE',
  actor: string,
  salespersonId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    actor,
    table_name: 'platform_sales_invitation_send',
    operation,
    row_id: salespersonId,
    new_data: data,
  });
  if (error) throw new Error(`audit_failed: ${error.message}`);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return response({ error: 'not_authorized' }, 401);

  const { data: admin } = await db
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!admin) return response({ error: 'platform_admin_required' }, 403);

  const input = (await request.json().catch(() => null)) as {
    salesperson_id?: string;
    qr_code_base64?: string;
  } | null;
  const salespersonId = input?.salesperson_id?.trim() ?? '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      salespersonId
    )
  ) {
    return response({ error: 'invalid_salesperson_id' }, 400);
  }
  const qrCodeBase64 = input?.qr_code_base64?.trim() ?? '';
  if (!isValidPngBase64(qrCodeBase64)) {
    return response({ error: 'invalid_qr_code' }, 400);
  }

  const { data: person, error: personError } = await db
    .from('platform_salespeople')
    .select('id,name,phone,invitation_code,active')
    .eq('id', salespersonId)
    .maybeSingle();
  if (personError) return response({ error: 'salesperson_lookup_failed' }, 500);
  if (!person) return response({ error: 'salesperson_not_found' }, 404);
  if (!person.active) return response({ error: 'salesperson_inactive' }, 409);
  if (!person.phone?.trim()) return response({ error: 'salesperson_phone_required' }, 409);
  const recipient = normalizeWhatsappPhone(person.phone);
  if (!recipient) return response({ error: 'salesperson_phone_invalid' }, 409);

  const invitationUrl = platformSalesInvitationUrl(appPublicUrl, person.invitation_code);
  const caption = platformSalesInvitationCaption(person, invitationUrl);
  const auditData = {
    recipient_suffix: recipient.slice(-4),
    invitation_code: person.invitation_code,
  };

  const { data: claimed, error: claimError } = await db.rpc(
    'claim_platform_sales_invitation_send',
    {
      p_salesperson_id: person.id,
      p_actor: auth.user.id,
      p_recipient_suffix: auditData.recipient_suffix,
      p_invitation_code: person.invitation_code,
    }
  );
  if (claimError) return response({ error: 'invitation_claim_failed' }, 500);
  if (!claimed) return response({ error: 'invitation_send_too_soon' }, 429);

  try {
    await sendWhatsappImage(recipient, qrCodeBase64, caption);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider_failed';
    const deliveryError =
      error instanceof DeliveryError ? error : new DeliveryError(message, true, false);
    const auditRecorded = await audit('UPDATE', auth.user.id, person.id, {
      ...auditData,
      outcome: deliveryError.accepted ? 'acceptance_unknown' : 'failed',
      error: message,
    })
      .then(() => true)
      .catch(auditError => {
        console.error(auditError);
        return false;
      });
    if (deliveryError.accepted) {
      return response(
        { accepted: true, delivery_uncertain: true, audit_recorded: auditRecorded },
        202
      );
    }
    return response({ error: message }, 502);
  }

  const auditRecorded = await audit('UPDATE', auth.user.id, person.id, {
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
