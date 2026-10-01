import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const job = {
  id: 'fixture-job',
  claim_token: 'fixture-claim',
  recipient: '0712345678',
  caption: 'Fixture Shop\n\nHi Amina. Your receipt is ready.',
  company_name_snapshot: 'Fixture Shop',
  snapshot: {
    company_name: 'Fixture Shop',
    company_logo_path: null,
    document_type: 'receipt',
    document_number: 'SALE-001',
    lines: [],
  },
};

async function fixture(options, run) {
  const directory = await mkdtemp(join(tmpdir(), 'sale-document-delivery-'));
  const saved = {
    Deno: globalThis.Deno,
    fetch: globalThis.fetch,
    renderer: globalThis.__testDocumentRenderer,
  };
  const oldInfo = console.info;
  const state = { imports: 0, renders: 0, calls: [], fetches: [], logs: [] };
  try {
    await mkdir(join(directory, 'generated'));
    for (const name of ['sale-document-delivery.ts', 'message-providers.ts']) {
      await copyFile(
        new URL(`../../supabase/functions/_shared/${name}`, import.meta.url),
        join(directory, name)
      );
    }
    await writeFile(
      join(directory, 'generated/documents.mjs'),
      `
      globalThis.__testDocumentRenderer.imports++;
      ${options.importFails ? 'throw new Error("renderer_load_failed");' : ''}
      export const MAX_LOGO_BYTES = 32;
      export async function preparePdfLogo(bytes) { return {type:'png',bytes}; }
      export async function renderSnapshotPdf(snapshot, identity, logo) {
        globalThis.__testDocumentRenderer.renders++;
        globalThis.__testDocumentRenderer.logo = logo;
        return new TextEncoder().encode('%PDF-1.7');
      }
    `
    );
    globalThis.__testDocumentRenderer = state;
    globalThis.Deno = {
      env: {
        get: name =>
          ({
            SUPABASE_URL: 'https://db.test',
            OPENWA_BASE_URL: 'https://gateway.test',
            OPENWA_API_KEY: 'fixture',
            OPENWA_SESSION: 'shop',
          })[name],
      },
    };
    globalThis.fetch = async (url, init) => {
      state.fetches.push({ url, init });
      if (url.startsWith('https://db.test/storage/')) {
        assert.equal(init.redirect, 'error');
        return new Response(new Uint8Array(options.logoBytes ?? 8));
      }
      assert.equal(url, 'https://gateway.test/api/sessions/shop/messages/send-document');
      return options.providerFails
        ? new Response('', { status: 500 })
        : Response.json({ messageId: 'accepted-fixture' });
    };
    console.info = (...args) => state.logs.push(args);
    const db = {
      rpc: async (name, args) => {
        state.calls.push({ name, args });
        if (name === 'claim_sale_document_delivery')
          return options.claimFails
            ? { data: null, error: { message: 'fixture claim error' } }
            : { data: Object.hasOwn(options, 'job') ? options.job : job, error: null };
        if (name === 'begin_sale_document_dispatch')
          return { data: options.allowed ?? true, error: null };
        assert.equal(name, 'finish_sale_document_delivery');
        return { data: null, error: null };
      },
    };
    const { processSaleDocument } = await import(
      pathToFileURL(join(directory, 'sale-document-delivery.ts')).href
    );
    await run(processSaleDocument, db, state);
  } finally {
    globalThis.Deno = saved.Deno;
    globalThis.fetch = saved.fetch;
    globalThis.__testDocumentRenderer = saved.renderer;
    console.info = oldInfo;
    await rm(directory, { recursive: true, force: true });
  }
}

test('empty recovery and failed claims never initialize the renderer or contact providers', async () => {
  for (const options of [{ job: null }, { claimFails: true }]) {
    await fixture({ ...options, importFails: true }, async (process, db, state) => {
      if (options.claimFails) await assert.rejects(process(db), /document_claim_failed/);
      else await process(db);
      assert.equal(state.imports, 0);
      assert.equal(state.fetches.length, 0);
      assert.equal(state.calls.length, 1);
    });
  }
});

test('invalid document identity fails before loading fonts or WASM', async () => {
  await fixture(
    { job: { ...job, company_name_snapshot: 'Different Shop' } },
    async (process, db, state) => {
      await process(db);
      assert.equal(state.imports, 0);
      assert.equal(state.fetches.length, 0);
      assert.equal(state.calls.at(-1).args.p_outcome, 'failed');
    }
  );
});

test('claimed work loads on demand, sends once, and logs timing metadata', async () => {
  await fixture({}, async (process, db, state) => {
    assert.equal(state.imports, 0);
    await process(db, job.id);
    assert.equal(state.imports, 1);
    assert.equal(state.renders, 1);
    assert.equal(state.calls[0].args.p_outbox_id, job.id);
    assert.deepEqual(
      state.calls.map(c => c.name),
      [
        'claim_sale_document_delivery',
        'begin_sale_document_dispatch',
        'finish_sale_document_delivery',
      ]
    );
    assert.equal(state.calls.at(-1).args.p_outcome, 'sent');
    assert.equal(state.fetches.length, 1);
    const [label, metrics] = state.logs[0];
    assert.equal(label, 'sale_document_sent');
    for (const key of [
      'renderer_init_ms',
      'logo_ms',
      'render_ms',
      'provider_ms',
      'render_and_send_ms',
    ]) {
      assert.ok(Number.isInteger(metrics[key]) && metrics[key] >= 0);
    }
    assert.equal(JSON.stringify(metrics).includes(job.recipient), false);
    assert.equal(JSON.stringify(metrics).includes(job.caption), false);
  });
});

test('a renderer import failure finalizes the claim without beginning dispatch', async () => {
  await fixture({ importFails: true }, async (process, db, state) => {
    await process(db);
    assert.equal(state.imports, 1);
    assert.equal(state.fetches.length, 0);
    assert.deepEqual(
      state.calls.map(c => c.name),
      ['claim_sale_document_delivery', 'finish_sale_document_delivery']
    );
    assert.equal(state.calls.at(-1).args.p_error, 'pdf_preparation_failed');
    assert.equal(state.calls.at(-1).args.p_outcome, 'failed');
  });
});

test('logo size protection still applies after deferred loading', async () => {
  await fixture(
    {
      job: { ...job, snapshot: { ...job.snapshot, company_logo_path: 'company/logo.svg' } },
      logoBytes: 33,
    },
    async (process, db, state) => {
      await process(db);
      assert.equal(state.renders, 0);
      assert.equal(state.fetches.length, 1);
      assert.equal(state.calls.at(-1).args.p_error, 'logo_too_large');
      assert.equal(state.calls.at(-1).args.p_outcome, 'failed');
    }
  );
});

test('a cancelled dispatch sends nothing; uncertain provider acceptance remains unknown', async () => {
  await fixture({ allowed: false }, async (process, db, state) => {
    await process(db);
    assert.equal(state.renders, 1);
    assert.equal(state.fetches.length, 0);
    assert.equal(state.calls.at(-1).name, 'begin_sale_document_dispatch');
  });
  await fixture({ providerFails: true }, async (process, db, state) => {
    await process(db);
    assert.equal(state.fetches.length, 1);
    assert.equal(state.calls.at(-1).args.p_outcome, 'unknown');
  });
});
