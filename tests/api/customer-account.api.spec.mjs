import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';

function localSupabaseEnvironment() {
  if (
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_JWT_SECRET
  ) {
    return {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      anonKey: process.env.SUPABASE_ANON_KEY,
      jwtSecret: process.env.SUPABASE_JWT_SECRET,
    };
  }
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values = Object.fromEntries(
    output
      .split('\n')
      .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map(match => [match[1], match[2]])
  );
  return {
    url: values.API_URL,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
    anonKey: values.ANON_KEY,
    jwtSecret: values.JWT_SECRET,
  };
}

const environment = localSupabaseEnvironment();
const baseUrl = new URL(environment.url);
if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) {
  throw new Error(`API tests refuse to target a non-local Supabase host: ${baseUrl.host}`);
}
const headers = {
  apikey: environment.serviceRoleKey,
  Authorization: `Bearer ${environment.serviceRoleKey}`,
};
const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtHeader = jwtPart({ alg: 'HS256', typ: 'JWT' });
const jwtPayload = jwtPart({
  role: 'authenticated',
  aud: 'authenticated',
  sub: randomUUID(),
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const authenticatedToken = `${jwtHeader}.${jwtPayload}.${createHmac('sha256', environment.jwtSecret)
  .update(`${jwtHeader}.${jwtPayload}`)
  .digest('base64url')}`;
const authenticatedHeaders = {
  apikey: environment.anonKey,
  Authorization: `Bearer ${authenticatedToken}`,
};
const anonymousHeaders = {
  apikey: environment.anonKey,
  Authorization: `Bearer ${environment.anonKey}`,
};

async function rest(path, init = {}) {
  return fetch(new URL(`/rest/v1/${path}`, baseUrl), {
    ...init,
    headers: { ...headers, ...init.headers },
  });
}

test('receipt children expose their generated parent relationships', async () => {
  const response = await rest(
    'customer_receipts?select=id,payments!payments_customer_receipt_id_fkey(id),customer_deposits!customer_deposits_customer_receipt_id_fkey(id)&limit=1'
  );
  assert.equal(response.status, 200, await response.text());
});

test('unified account RPCs are present in the PostgREST contract', async () => {
  const response = await rest('', {
    headers: { ...authenticatedHeaders, Accept: 'application/openapi+json' },
  });
  const contract = await response.json();
  assert.equal(response.status, 200, JSON.stringify(contract));
  for (const name of [
    'post_customer_receipt',
    'post_credit_sale_at_location',
    'post_customer_receipt_reversal',
  ]) {
    assert.ok(contract.paths[`/rpc/${name}`], `missing /rpc/${name}`);
  }
});

test('public statements return the unified account shape', async () => {
  const companyId = randomUUID();
  const customerId = randomUUID();
  const token = `statement-${randomUUID()}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const writeHeaders = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  try {
    let response = await rest('companies', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({
        id: companyId,
        code: `account-api-${companyId}`,
        name: 'Account API Shop',
        status: 'approved',
      }),
    });
    assert.ok(response.ok, await response.text());
    response = await rest('customers', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ id: customerId, company_id: companyId, first_name: 'Amina' }),
    });
    assert.ok(response.ok, await response.text());
    response = await rest('customer_statement_links', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({
        company_id: companyId,
        customer_id: customerId,
        token_hash: tokenHash,
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });
    assert.ok(response.ok, await response.text());

    response = await rest('rpc/public_customer_statement', {
      method: 'POST',
      headers: { ...anonymousHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
    const statement = await response.json();
    assert.equal(response.status, 200, JSON.stringify(statement));
    assert.equal(statement.amount_due, 0);
    assert.equal(statement.downpayment_available, 0);
    assert.equal(statement.account_balance, 0);
    assert.equal(statement.outstanding_total, statement.amount_due);
    assert.deepEqual(statement.orders, []);
    assert.deepEqual(statement.activities, []);
  } finally {
    await rest(`companies?id=eq.${companyId}`, { method: 'DELETE' });
  }
});
