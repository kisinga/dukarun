import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Run the actual Edge modules with only infrastructure boundaries replaced.
async function loadEdge(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'edge-fixtures',
        setup(b) {
          b.onResolve({ filter: /^npm:|generated\/documents\.mjs$/ }, args => ({
            path: args.path,
            namespace: 'fixtures',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixtures' }, args => ({
            contents: args.path.startsWith('npm:')
              ? 'export const createClient = () => globalThis.identityDb;'
              : `export const MAX_LOGO_BYTES=10000; export const preparePdfLogo=()=>null;
           export const renderSnapshotPdf=async()=>{globalThis.identityRenders++;return new TextEncoder().encode('%PDF-1.7');};`,
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64') +
      '#' +
      crypto.randomUUID()
  );
}
async function fixture(run) {
  const names = ['Deno', 'EdgeRuntime', 'fetch', 'identityDb', 'identityRenders'];
  const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const calls = [],
    requests = [],
    updates = [],
    attempts = [];
  let handler;
  let row;
  let job = null;
  globalThis.identityRenders = 0;
  globalThis.Deno = {
    env: {
      get: key =>
        ({
          SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
          SUPABASE_URL: 'https://database.test',
          SUPABASE_ANON_KEY: 'anon',
          OPENWA_BASE_URL: 'https://provider.test',
          OPENWA_API_KEY: 'fixture',
          TEXTSMS_API_KEY: 'fixture',
          TEXTSMS_PARTNER_ID: 'fixture',
          TEXTSMS_SHORTCODE: 'fixture',
          APP_PUBLIC_URL: 'https://app.example.test',
        })[key],
    },
    serve: fn => {
      handler = fn;
    },
  };
  globalThis.EdgeRuntime = { waitUntil: () => {} };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json({ messageId: 'accepted' });
  };
  globalThis.identityDb = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_sale_document_delivery') return { data: job };
      return { data: true, error: null };
    },
    from(table) {
      let update,
        insert,
        single = false;
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => {
          single = true;
          return q;
        },
        update: value => {
          update = value;
          return q;
        },
        insert: value => {
          insert = value;
          return q;
        },
        then(resolve, reject) {
          if (insert) {
            if (table === 'delivery_attempts') attempts.push(insert);
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          if (update) {
            updates.push(update);
            Object.assign(row, update);
            return Promise.resolve({ data: [{ id: row.id }] }).then(resolve, reject);
          }
          return Promise.resolve({ data: single ? { status: row.status } : [{ ...row }] }).then(
            resolve,
            reject
          );
        },
      };
      return q;
    },
  };
  const state = {
    calls,
    requests,
    updates,
    attempts,
    setRow: value => {
      row = value;
    },
    setJob: value => {
      job = value;
    },
    async invoke(body) {
      return handler(
        new Request('https://edge.test', {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture-service' },
          body: JSON.stringify(body ?? {}),
        })
      );
    },
  };
  try {
    await run(state);
  } finally {
    Object.assign(globalThis, saved);
  }
}
const rowFixture = (body, channel = 'whatsapp') => ({
  id: 'outbox',
  company_id: 'company',
  company_name_snapshot: 'Original Store',
  channel,
  body,
  status: 'pending',
  recipient: '+254712345678',
  source: 'reminder',
  attempts: 0,
  max_attempts: 2,
  fallback_channel: 'sms',
  fallback_body: 'Original Store: Fallback.',
});

test('notification worker permanently rejects malformed identity without provider call or fallback', async () => {
  for (const body of ['Wrong Store\n\nUpdate.', 'Original Store\n\n{{unknown}}']) {
    await fixture(async s => {
      s.setRow(rowFixture(body));
      await loadEdge('supabase/functions/notification-flush/index.ts');
      assert.equal((await s.invoke()).status, 200);
      assert.equal(s.requests.length, 0);
      assert.equal(s.updates.at(-1).status, 'failed');
      assert.match(s.updates.at(-1).error, /^message_contract:/);
      assert.ok(!s.calls.some(c => c.name === 'queue_sms_fallback'));
      assert.ok(
        s.calls.some(c => c.name === 'finalize_message_quota' && c.args.p_accepted === false)
      );
      assert.equal(s.attempts[0].accepted, false);
    });
  }
});
test('notification worker expands runtime links, reconciles full SMS and sends the frozen name', async () => {
  await fixture(async s => {
    s.setRow(rowFixture('Original Store: Sign in: {{app_url}}/login', 'sms'));
    await loadEdge('supabase/functions/notification-flush/index.ts');
    await s.invoke();
    assert.equal(
      s.requests[0].body.message,
      'Original Store: Sign in: https://app.example.test/login'
    );
    assert.equal(
      s.calls.find(c => c.name === 'reconcile_runtime_sms_quota').args.p_final_body,
      s.requests[0].body.message
    );
    assert.equal(s.updates.at(-1).status, 'sent');
  });
});
test('PDF worker rejects wrong snapshot identity and oversized captions before rendering or dispatch', async () => {
  for (const caption of [
    'Wrong Store\n\nInvoice INV-1.',
    'Original Store\n\n' + 'a'.repeat(1024),
  ]) {
    await fixture(async s => {
      s.setJob({
        id: 'pdf',
        claim_token: 'claim',
        company_name_snapshot: 'Original Store',
        caption,
        snapshot: { company_name: 'Original Store', company_logo_path: 'logo.png' },
      });
      const { processSaleDocument } = await loadEdge(
        'supabase/functions/_shared/sale-document-delivery.ts'
      );
      await processSaleDocument(globalThis.identityDb);
      assert.equal(s.requests.length, 0);
      assert.equal(globalThis.identityRenders, 0);
      assert.ok(!s.calls.some(c => c.name === 'begin_sale_document_dispatch'));
      const finish = s.calls.find(c => c.name === 'finish_sale_document_delivery');
      assert.equal(finish.args.p_outcome, 'failed');
      assert.match(finish.args.p_error, /^message_contract:/);
    });
  }
});
test('PDF worker sends the original document identity from its claimed payload', async () => {
  await fixture(async s => {
    s.setJob({
      id: 'pdf',
      claim_token: 'claim',
      company_name_snapshot: 'Original Store',
      recipient: '+254712345678',
      caption:
        'Original Store\n\nYour invoice INV-1 is attached.\n\nView online:\nhttps://store.test/document/1',
      snapshot: {
        company_name: 'Original Store',
        document_type: 'invoice',
        document_number: 'INV-1',
      },
    });
    const { processSaleDocument } = await loadEdge(
      'supabase/functions/_shared/sale-document-delivery.ts'
    );
    await processSaleDocument(globalThis.identityDb);
    assert.match(s.requests[0].body.caption, /^Original Store\n\n/);
    assert.equal(
      s.calls.find(c => c.name === 'finish_sale_document_delivery').args.p_outcome,
      'sent'
    );
  });
});
test('actual platform test endpoint wraps editable content as a Dukarun test on both channels', async () => {
  for (const channel of ['sms', 'whatsapp'])
    await fixture(async s => {
      await loadEdge('supabase/functions/platform-message-test/index.ts');
      assert.equal(
        (await s.invoke({ channel, recipient: '+254712345678', body: 'Test content.' })).status,
        200
      );
      const sent = s.requests[0].body;
      assert.match(
        sent.message ?? sent.text,
        channel === 'sms' ? /^Dukarun: Test message/ : /^Dukarun\n\nTest message/
      );
    });
});

test('a contract error returned by runtime SQL validation is permanent and cannot fall back', async () => {
  await fixture(async s => {
    s.setRow(rowFixture('Original Store: Valid-looking message.', 'sms'));
    const originalRpc = globalThis.identityDb.rpc;
    globalThis.identityDb.rpc = async (name, args) =>
      name === 'reconcile_runtime_sms_quota'
        ? { error: { message: 'message_contract: invalid_body' } }
        : originalRpc(name, args);
    await loadEdge('supabase/functions/notification-flush/index.ts');
    await s.invoke();
    assert.equal(s.requests.length, 0);
    assert.equal(s.updates.at(-1).status, 'failed');
    assert.equal(s.updates.at(-1).error, 'message_contract: invalid_body');
    assert.ok(!s.calls.some(c => c.name === 'queue_sms_fallback'));
  });
});
