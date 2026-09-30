import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeliveryError,
  sendWhatsappDocument,
} from '../../supabase/functions/_shared/message-providers.ts';

async function withProvider(fetcher, run) {
  const saved = { Deno: globalThis.Deno, fetch: globalThis.fetch };
  globalThis.Deno = {
    env: {
      get: key =>
        ({
          OPENWA_BASE_URL: 'https://gateway.test',
          OPENWA_API_KEY: 'test',
          OPENWA_SESSION: 'shop',
        })[key],
    },
  };
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    Object.assign(globalThis, saved);
  }
}
const pdf = new TextEncoder().encode('%PDF-1.7');
test('sends PDF bytes with a readable filename and personalized secure-link caption', async () => {
  await withProvider(
    async (url, init) => {
      assert.equal(url, 'https://gateway.test/api/sessions/shop/messages/send-document');
      assert.deepEqual(JSON.parse(init.body), {
        chatId: '254712345678@c.us',
        base64: Buffer.from(pdf).toString('base64'),
        mimetype: 'application/pdf',
        filename: 'receipt-SALE-001.pdf',
        caption: 'Hi Amina. View online: https://shop.test/document/secure',
      });
      assert.ok(init.signal);
      return Response.json({ messageId: 'accepted-123' });
    },
    async () =>
      assert.equal(
        await sendWhatsappDocument(
          '0712345678',
          pdf,
          'receipt-SALE-001.pdf',
          'Hi Amina. View online: https://shop.test/document/secure'
        ),
        'accepted-123'
      )
  );
});
for (const status of [408, 500, 502])
  test(`HTTP ${status} has uncertain acceptance and must not auto-retry`, async () => {
    await withProvider(
      async () => new Response('', { status }),
      async () => {
        await assert.rejects(
          sendWhatsappDocument('0712345678', pdf, 'receipt.pdf', 'Hi'),
          e => e instanceof DeliveryError && e.accepted
        );
      }
    );
  });
test('429 is a definite transient rejection', async () => {
  await withProvider(
    async () => new Response('', { status: 429 }),
    async () => {
      await assert.rejects(
        sendWhatsappDocument('0712345678', pdf, 'receipt.pdf', 'Hi'),
        e => e instanceof DeliveryError && !e.accepted && !e.permanent
      );
    }
  );
});
test('timeout and malformed success are unknown outcomes', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('timeout');
    },
    async () => Response.json({}),
  ]) {
    await withProvider(fetcher, async () => {
      await assert.rejects(
        sendWhatsappDocument('0712345678', pdf, 'receipt.pdf', 'Hi'),
        e => e instanceof DeliveryError && e.accepted
      );
    });
  }
});
