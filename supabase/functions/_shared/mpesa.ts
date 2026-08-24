export type MpesaPrivateConfig = {
  attempt_id?: string;
  intent_id?: string;
  company_id: string;
  connection_id?: string;
  id?: string;
  environment: 'sandbox' | 'production';
  shortcode_type: 'till' | 'paybill';
  organization_shortcode: string;
  business_shortcode: string;
  party_b: string;
  payer_phone?: string;
  amount?: number;
  client_ref?: string;
  checkout_request_id?: string;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  callback_base_url: string;
};

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: cors });
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizePhone(value: string): string {
  let phone = String(value ?? '').replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = `254${phone.slice(1)}`;
  if (!/^254[17][0-9]{8}$/.test(phone)) throw new Error('invalid_mpesa_phone');
  return phone;
}

export function darajaTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`;
}

export function darajaBase(environment: 'sandbox' | 'production'): string {
  return environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export function callbackBaseUrl(config: MpesaPrivateConfig): string {
  const callbackBase = String(config.callback_base_url ?? '').replace(/\/+$/, '');
  if (!callbackBase.startsWith('https://')) throw new Error('mpesa_callback_url_not_configured');
  return callbackBase;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { errorMessage: text || `HTTP ${response.status}` };
  }
}

export async function darajaAccessToken(config: MpesaPrivateConfig): Promise<string> {
  if (!config.consumer_key || !config.consumer_secret) throw new Error('mpesa_credentials_missing');
  const authorization = btoa(`${config.consumer_key}:${config.consumer_secret}`);
  const response = await fetch(
    `${darajaBase(config.environment)}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${authorization}` },
    }
  );
  const body = await responseBody(response);
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(String(body.errorMessage ?? body.error_description ?? 'mpesa_oauth_failed'));
  }
  return body.access_token;
}

export async function initiateStk(
  config: MpesaPrivateConfig,
  callbackUrl: string
): Promise<Record<string, unknown>> {
  const timestamp = darajaTimestamp();
  const token = await darajaAccessToken(config);
  const password = btoa(`${config.business_shortcode}${config.passkey}${timestamp}`);
  const response = await fetch(
    `${darajaBase(config.environment)}/mpesa/stkpush/v1/processrequest`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: config.business_shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType:
          config.shortcode_type === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        Amount: config.amount,
        PartyA: config.payer_phone,
        PartyB: config.party_b,
        PhoneNumber: config.payer_phone,
        CallBackURL: callbackUrl,
        AccountReference: String(config.client_ref ?? config.intent_id ?? '')
          .replace(/-/g, '')
          .slice(0, 12),
        TransactionDesc: 'Dukarun payment',
      }),
    }
  );
  const body = await responseBody(response);
  if (!response.ok)
    throw new Error(String(body.errorMessage ?? body.ResponseDescription ?? 'stk_request_failed'));
  return body;
}

export async function queryStk(config: MpesaPrivateConfig): Promise<Record<string, unknown>> {
  if (!config.checkout_request_id) throw new Error('checkout_request_id_missing');
  const timestamp = darajaTimestamp();
  const token = await darajaAccessToken(config);
  const password = btoa(`${config.business_shortcode}${config.passkey}${timestamp}`);
  const response = await fetch(`${darajaBase(config.environment)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.business_shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: config.checkout_request_id,
    }),
  });
  const body = await responseBody(response);
  if (!response.ok)
    throw new Error(String(body.errorMessage ?? body.ResponseDescription ?? 'stk_query_failed'));
  return body;
}

export function callbackMetadata(payload: Record<string, unknown>): Map<string, unknown> {
  const callback = (payload.Body as Record<string, unknown> | undefined)?.stkCallback as
    Record<string, unknown> | undefined;
  const metadata = (callback?.CallbackMetadata as Record<string, unknown> | undefined)?.Item;
  const result = new Map<string, unknown>();
  if (!Array.isArray(metadata)) return result;
  for (const item of metadata) {
    if (item && typeof item === 'object' && 'Name' in item) {
      result.set(
        String((item as Record<string, unknown>).Name),
        (item as Record<string, unknown>).Value
      );
    }
  }
  return result;
}

export function parseMpesaTime(value: unknown): string | null {
  const raw = String(value ?? '');
  if (!/^\d{14}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+03:00`;
}

export type StkResultClass = 'success' | 'terminal' | 'pending';

export function classifyStkResult(code: string): StkResultClass {
  if (code === '0') return 'success';
  return ['1', '1032', '1037', '2001'].includes(code) ? 'terminal' : 'pending';
}
