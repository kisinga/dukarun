export class DeliveryError extends Error {
  readonly permanent: boolean;
  readonly accepted: boolean;

  constructor(message: string, permanent: boolean, accepted: boolean) {
    super(message);
    this.permanent = permanent;
    this.accepted = accepted;
  }
}

/** Identity is supplied by the business record, never by message text or the recipient. */
export type MessageIdentity =
  { scope: 'company' | 'platform_account'; companyName: string } | { scope: 'platform' };

function identityPrefix(channel: 'sms' | 'whatsapp', identity: MessageIdentity): string {
  if (!identity || !['company', 'platform_account', 'platform'].includes(identity.scope)) {
    throw new DeliveryError('message_contract: missing_identity', true, false);
  }
  if (identity.scope === 'platform') return channel === 'sms' ? 'Dukarun: ' : 'Dukarun\n\n';
  const name = identity.companyName;
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name !== name.trim() ||
    /[\x00-\x1f\x7f]|\{\{|\}\}/.test(name)
  ) {
    throw new DeliveryError('message_contract: invalid_company_name', true, false);
  }
  if (identity.scope === 'platform_account') {
    return channel === 'sms' ? `Dukarun - ${name}: ` : `Dukarun\nAccount: ${name}\n\n`;
  }
  return channel === 'sms' ? `${name}: ` : `${name}\n\n`;
}

export function assertOutboundMessage(
  channel: 'sms' | 'whatsapp',
  body: string,
  identity: MessageIdentity
): void {
  const prefix = identityPrefix(channel, identity);
  if (
    typeof body !== 'string' ||
    !body.startsWith(prefix) ||
    !body.slice(prefix.length).trim() ||
    /\{\{|\}\}|\\n|[\x00-\x08\x0b-\x1f\x7f]/.test(body)
  ) {
    throw new DeliveryError('message_contract: invalid_body', true, false);
  }
}

/** Mirrors public.format_outbound_message; SQL owns queued bodies and previews. */
export function formatOutboundMessage(
  channel: 'sms' | 'whatsapp',
  body: string,
  identity: MessageIdentity
): string {
  const prefix = identityPrefix(channel, identity);
  const content = body.replace(/\r\n?/g, '\n').trim();
  const result = content.startsWith(prefix) ? content : prefix + content;
  assertOutboundMessage(channel, result, identity);
  return result;
}

export function isMessageContractError(error: unknown): boolean {
  return error instanceof DeliveryError && error.message.startsWith('message_contract:');
}

export function normalizeWhatsappPhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
  return /^[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function kePhone(raw: string): string {
  const normalized = normalizeWhatsappPhone(raw);
  if (!normalized) throw new DeliveryError('invalid_recipient', true, false);
  return normalized;
}

export async function requestProvider(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const permanent =
        response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      throw new DeliveryError(`${label} http ${response.status}`, permanent, false);
    }
    return response;
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError(
      error instanceof Error ? error.message : `${label} network error`,
      false,
      true
    );
  }
}

export async function sendSms(
  recipient: string,
  body: string,
  identity: MessageIdentity
): Promise<void> {
  assertOutboundMessage('sms', body, identity);
  const apiKey = Deno.env.get('TEXTSMS_API_KEY');
  const partnerID = Deno.env.get('TEXTSMS_PARTNER_ID');
  const shortcode = Deno.env.get('TEXTSMS_SHORTCODE');
  if (!apiKey || !partnerID || !shortcode)
    throw new DeliveryError('provider_not_configured: textsms', true, false);
  const response = await requestProvider(
    'https://sms.textsms.co.ke/api/services/sendsms/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        partnerID,
        message: body,
        shortcode,
        mobile: kePhone(recipient),
      }),
    },
    'textsms'
  );
  const result = await response.json().catch(() => null);
  const code =
    result?.responses?.[0]?.['respose-code'] ?? result?.responses?.[0]?.['response-code'];
  if (code !== undefined && code !== 200) {
    throw new DeliveryError(
      `textsms code ${code}: ${result?.responses?.[0]?.['response-description'] ?? ''}`,
      true,
      false
    );
  }
}

export async function sendWhatsapp(
  recipient: string,
  body: string,
  identity: MessageIdentity
): Promise<void> {
  assertOutboundMessage('whatsapp', body, identity);
  const baseUrl = Deno.env.get('OPENWA_BASE_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const session = Deno.env.get('OPENWA_SESSION') ?? 'default';
  if (!baseUrl || !apiKey) throw new DeliveryError('provider_not_configured: openwa', true, false);
  await requestProvider(
    `${baseUrl}/api/sessions/${session}/messages/send-text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ chatId: `${kePhone(recipient)}@c.us`, text: body }),
    },
    'openwa'
  );
}

export async function sendWhatsappImage(
  recipient: string,
  base64: string,
  caption: string,
  identity: MessageIdentity
): Promise<void> {
  assertOutboundMessage('whatsapp', caption, identity);
  if (caption.length > 1024)
    throw new DeliveryError('message_contract: caption_too_long', true, false);
  const baseUrl = Deno.env.get('OPENWA_BASE_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const session = Deno.env.get('OPENWA_SESSION') ?? 'default';
  if (!baseUrl || !apiKey) throw new DeliveryError('provider_not_configured: openwa', true, false);
  await requestProvider(
    `${baseUrl}/api/sessions/${session}/messages/send-image`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        chatId: `${kePhone(recipient)}@c.us`,
        base64,
        mimetype: 'image/png',
        filename: 'dukarun-invitation.png',
        caption,
      }),
    },
    'openwa'
  );
}

/** OpenWA retains attachments according to its own media retention policy. */
export async function sendWhatsappDocument(
  recipient: string,
  bytes: Uint8Array,
  filename: string,
  caption: string,
  identity: MessageIdentity
): Promise<string> {
  assertOutboundMessage('whatsapp', caption, identity);
  if (caption.length > 1024)
    throw new DeliveryError('message_contract: caption_too_long', true, false);
  const baseUrl = Deno.env.get('OPENWA_BASE_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const session = Deno.env.get('OPENWA_SESSION') ?? 'default';
  if (!baseUrl || !apiKey) throw new DeliveryError('provider_not_configured: openwa', true, false);
  if (bytes.length > 5_000_000 || !filename.endsWith('.pdf') || caption.length > 1024)
    throw new DeliveryError('invalid_document_payload', true, false);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  // A timeout or 5xx can happen after the gateway has handed the document to WhatsApp.
  // Only definite rejection (e.g. rate limiting) is safe to retry automatically.
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/api/sessions/${encodeURIComponent(session)}/messages/send-document`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          chatId: `${kePhone(recipient)}@c.us`,
          base64: btoa(binary),
          mimetype: 'application/pdf',
          filename,
          caption,
        }),
      }
    );
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('provider_acceptance_unknown', false, true);
  }
  if (!response.ok)
    throw new DeliveryError(
      `openwa_document_http_${response.status}`,
      response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status),
      response.status >= 500 || response.status === 408
    );
  const result = await response.json().catch(() => null);
  const messageId = result?.messageId ?? result?.data?.messageId;
  if (typeof messageId !== 'string' || !messageId)
    throw new DeliveryError('provider_acceptance_unknown', false, true);
  return messageId;
}
