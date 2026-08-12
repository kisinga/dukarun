import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { journalPageSelect } from '../../apps/web/src/app/money/journal-query.ts';

function localSupabaseEnvironment() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
  };
}

const environment = localSupabaseEnvironment();
const baseUrl = new URL(environment.url);
if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) {
  throw new Error(`API contract tests refuse to target a non-local Supabase host: ${baseUrl.host}`);
}
if (!environment.serviceRoleKey) throw new Error('Local Supabase service-role key is unavailable.');

const headers = {
  apikey: environment.serviceRoleKey,
  Authorization: `Bearer ${environment.serviceRoleKey}`,
};

async function rest(path, select, filters = {}) {
  const url = new URL(`/rest/v1/${path}`, baseUrl);
  url.searchParams.set('select', select);
  url.searchParams.set('limit', '1');
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return fetch(url, { headers });
}

test('the account options endpoint remains queryable', async () => {
  const response = await rest('ledger_accounts', 'id,code,name,type,is_active');
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.ok(Array.isArray(JSON.parse(body)));
});

test('journal history aliases use the explicit entry_id relationship', async () => {
  const response = await rest(
    'ledger_journal_entries',
    journalPageSelect({
      requiredAccountCode: 'EXPENSES',
      accountCode: 'CASH_ON_HAND',
    }),
    {
      'required_filter.ledger_accounts.code': 'eq.EXPENSES',
      'account_filter.ledger_accounts.code': 'eq.CASH_ON_HAND',
    }
  );
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.ok(Array.isArray(JSON.parse(body)));
});
