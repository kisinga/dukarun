const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function companyIdFromAccessToken(token: string): string | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { company_id?: unknown };
    return typeof claims.company_id === 'string' && UUID.test(claims.company_id)
      ? claims.company_id
      : null;
  } catch {
    return null;
  }
}

export async function createUsertourIdentityToken(input: {
  userId: string;
  companyId: string;
  secret: string;
  nowSeconds?: number;
}): Promise<string> {
  if (!input.secret) throw new Error('usertour_signing_secret_missing');
  if (!UUID.test(input.userId) || !UUID.test(input.companyId)) {
    throw new Error('invalid_identity_claims');
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({ sub: input.userId, companyId: input.companyId, iat: now, exp: now + 15 * 60 })
  );
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
