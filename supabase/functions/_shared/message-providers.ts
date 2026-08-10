export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly accepted: boolean
  ) {
    super(message);
  }
}

function kePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits.startsWith('0') ? '254' + digits.slice(1) : digits;
}

export async function requestProvider(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  try {
    const response = await fetch(url, init);
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

export async function sendSms(recipient: string, body: string): Promise<void> {
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

export async function sendWhatsapp(recipient: string, body: string): Promise<void> {
  const baseUrl = Deno.env.get('OPENWA_BASE_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const session = Deno.env.get('OPENWA_SESSION') ?? 'default';
  if (!baseUrl || !apiKey) throw new DeliveryError('provider_not_configured: openwa', true, false);
  await requestProvider(
    `${baseUrl}/api/sessions/${session}/messages/send-text`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ chatId: `${kePhone(recipient)}@s.whatsapp.net`, text: body }),
    },
    'openwa'
  );
}
