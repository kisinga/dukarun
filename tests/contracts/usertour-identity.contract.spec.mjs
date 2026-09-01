import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  companyIdFromAccessToken,
  createUsertourIdentityToken,
  identityFromAccessToken,
} from '../../supabase/functions/_shared/usertour-identity.ts';

const userId = '123e4567-e89b-42d3-a456-426614174000';
const companyId = '123e4567-e89b-42d3-a456-426614174001';

const base64Url = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('Usertour identity accepts only valid user and active-company UUID claims', () => {
  const accessToken = `header.${base64Url({ sub: userId, company_id: companyId })}.sig`;
  assert.deepEqual(identityFromAccessToken(accessToken), { userId, companyId });
  assert.equal(companyIdFromAccessToken(accessToken), companyId);
  assert.equal(
    companyIdFromAccessToken(
      `header.${base64Url({ sub: userId, company_id: 'private-name' })}.sig`
    ),
    null
  );
  assert.equal(
    identityFromAccessToken(
      `header.${base64Url({ sub: 'private-name', company_id: companyId })}.sig`
    ),
    null
  );
  assert.equal(companyIdFromAccessToken('not-a-token'), null);
});

test('Usertour identity is HS256 signed and expires in fifteen minutes', async () => {
  const secret = 'contract-test-secret';
  const token = await createUsertourIdentityToken({
    userId,
    companyId,
    secret,
    nowSeconds: 10_000,
  });
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.deepEqual(claims, { sub: userId, companyId, iat: 10_000, exp: 10_900 });

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  assert.equal(
    await crypto.subtle.verify(
      'HMAC',
      key,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`)
    ),
    true
  );
});

test('Usertour identity signing fails closed when the secret is missing', async () => {
  await assert.rejects(
    createUsertourIdentityToken({ userId, companyId, secret: '' }),
    /usertour_signing_secret_missing/
  );
});

test('Usertour identity endpoint relies on gateway verification and fails closed', async () => {
  const [source, config] = await Promise.all([
    readFile('supabase/functions/usertour-identity/index.ts', 'utf8'),
    readFile('supabase/config.toml', 'utf8'),
  ]);
  assert.match(config, /\[functions\.usertour-identity\]\s*verify_jwt = true/);
  assert.match(source, /identityFromAccessToken\(accessToken\)/);
  assert.match(source, /not_authenticated.*401/s);
  assert.match(source, /active_company_required.*403/s);
  assert.match(source, /usertour_configuration_missing.*503/s);
  assert.doesNotMatch(source, /email|user_metadata|amount|entity_id/i);
});
