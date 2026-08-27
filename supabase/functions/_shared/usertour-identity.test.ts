import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { companyIdFromAccessToken, createUsertourIdentityToken } from './usertour-identity.ts';

const userId = '123e4567-e89b-42d3-a456-426614174000';
const companyId = '123e4567-e89b-42d3-a456-426614174001';

function unsignedAccessToken(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${payload}.signature`;
}

Deno.test('company scope is read only from a valid UUID claim', () => {
  assertEquals(companyIdFromAccessToken(unsignedAccessToken({ company_id: companyId })), companyId);
  assertEquals(
    companyIdFromAccessToken(unsignedAccessToken({ company_id: 'not-a-company' })),
    null
  );
});

Deno.test('identity token is scoped and expires after fifteen minutes', async () => {
  const token = await createUsertourIdentityToken({
    userId,
    companyId,
    secret: 'test-secret',
    nowSeconds: 1_000,
  });
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  assertEquals(payload, { sub: userId, companyId, iat: 1_000, exp: 1_900 });
  assertEquals(token.split('.').length, 3);
});

Deno.test('identity signing fails closed without the server secret', async () => {
  await assertRejects(
    () => createUsertourIdentityToken({ userId, companyId, secret: '' }),
    Error,
    'usertour_signing_secret_missing'
  );
});
