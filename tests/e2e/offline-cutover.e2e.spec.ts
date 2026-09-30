import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

let moduleSource: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['apps/web/src/app/pos/offline/offline-db.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  moduleSource = result.outputFiles[0].text;
});

test('hard cutover clears every old queue and confirmation, keeps carts/catalogue, and retains new queues on reload', async ({
  page,
}) => {
  await page.route('http://offline.test/**', route =>
    route.fulfill({
      contentType: route.request().url().endsWith('.js') ? 'application/javascript' : 'text/html',
      body: route.request().url().endsWith('.js')
        ? moduleSource
        : '<!doctype html><title>Offline upgrade test</title>',
    })
  );
  await page.goto('http://offline.test/');
  await page.evaluate(async () => {
    const open = indexedDB.open('dukarun-pos-offline', 6);
    open.onupgradeneeded = () => {
      for (const name of ['outbox', 'cashier', 'cart', 'products'])
        open.result.createObjectStore(name, { keyPath: name === 'outbox' ? 'client_ref' : 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(['outbox', 'cashier', 'cart', 'products'], 'readwrite');
    tx.objectStore('outbox').put({
      client_ref: 'old-paid',
      company_id: 'one',
      payments: [{ method: 'cash', amount: 500 }],
    });
    tx.objectStore('outbox').put({ client_ref: 'old-unscoped' });
    tx.objectStore('outbox').put({ client_ref: 'another-account', company_id: 'two' });
    tx.objectStore('cashier').put({ key: 'session', session: { id: 'old-session' } });
    tx.objectStore('cart').put({ key: 'cart', lines: [{ quantity: 2 }] });
    tx.objectStore('products').put({ key: 'catalogue', products: [{ id: 'product' }] });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const upgraded = await page.evaluate(async () => {
    const { offlineDb } = await import(/* @vite-ignore */ 'http://offline.test/offline.js');
    const db = await offlineDb();
    const result = {
      version: db.version,
      outbox: await db.getAll('outbox'),
      cashier: await db.getAll('cashier'),
      cart: await db.getAll('cart'),
      products: await db.getAll('products'),
    };
    await db.put('outbox', {
      client_ref: 'new-sale',
      request: { protocol_version: 2 },
      queued_at: '2026-09-29',
    });
    return result;
  });
  expect(upgraded).toEqual({
    version: 7,
    outbox: [],
    cashier: [],
    cart: [{ key: 'cart', lines: [{ quantity: 2 }] }],
    products: [{ key: 'catalogue', products: [{ id: 'product' }] }],
  });
  await page.reload();
  expect(
    await page.evaluate(async () => {
      const { offlineDb } = await import(/* @vite-ignore */ 'http://offline.test/offline.js');
      return (await (await offlineDb()).getAll('outbox')).map(
        (row: { client_ref: string }) => row.client_ref
      );
    })
  ).toEqual(['new-sale']);
});
