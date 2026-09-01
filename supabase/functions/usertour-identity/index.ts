import {
  createUsertourIdentityToken,
  identityFromAccessToken,
} from '../_shared/usertour-identity.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...cors, 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const accessToken = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!authorization || !accessToken) return json({ error: 'not_authenticated' }, 401);

  // Supabase verifies this JWT before invoking the function (see config.toml). Reading the
  // already-verified claims avoids a second Auth network request on every guide launch.
  const identity = identityFromAccessToken(accessToken);
  if (!identity) return json({ error: 'active_company_required' }, 403);

  const secret = Deno.env.get('USERTOUR_SIGNING_SECRET') ?? '';
  if (!secret) return json({ error: 'usertour_configuration_missing' }, 503);

  try {
    const token = await createUsertourIdentityToken({
      userId: identity.userId,
      companyId: identity.companyId,
      secret,
    });
    return json({ token, companyId: identity.companyId, expiresIn: 15 * 60 });
  } catch (signingError) {
    console.error(signingError);
    return json({ error: 'identity_token_failed' }, 500);
  }
});
