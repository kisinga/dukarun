import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeliveryError,
  formatOutboundMessage,
  isMessageContractError,
  sendSms,
  sendWhatsapp,
  sendWhatsappImage,
  sendWhatsappDocument,
} from '../../supabase/functions/_shared/message-providers.ts';

const shop = { scope: 'company', companyName: 'Amina Store' };
const platform = { scope: 'platform' };
const account = { scope: 'platform_account', companyName: 'Amina Store' };
const pdf = new TextEncoder().encode('%PDF-1.7');
const senders = [
  ['sms', (body, identity) => sendSms('0712345678', body, identity)],
  ['whatsapp', (body, identity) => sendWhatsapp('0712345678', body, identity)],
  ['whatsapp', (body, identity) => sendWhatsappImage('0712345678', 'cG5n', body, identity)],
  [
    'whatsapp',
    (body, identity) => sendWhatsappDocument('0712345678', pdf, 'invoice.pdf', body, identity),
  ],
];
async function withProviders(run) {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno };
  const calls = [];
  globalThis.Deno = {
    env: {
      get: key =>
        ({
          TEXTSMS_API_KEY: 'test',
          TEXTSMS_PARTNER_ID: 'test',
          TEXTSMS_SHORTCODE: 'test',
          OPENWA_BASE_URL: 'https://provider.test',
          OPENWA_API_KEY: 'test',
        })[key],
    },
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...JSON.parse(init.body) });
    return Response.json({ messageId: 'accepted', responses: [{ 'response-code': 200 }] });
  };
  try {
    await run(calls);
  } finally {
    Object.assign(globalThis, saved);
  }
}

test('exact canonical openings for all scopes are idempotent', () => {
  for (const [channel, identity, expected] of [
    ['sms', shop, 'Amina Store: Update.'],
    ['whatsapp', shop, 'Amina Store\n\nUpdate.'],
    ['sms', account, 'Dukarun - Amina Store: Update.'],
    ['whatsapp', account, 'Dukarun\nAccount: Amina Store\n\nUpdate.'],
    ['sms', platform, 'Dukarun: Update.'],
    ['whatsapp', platform, 'Dukarun\n\nUpdate.'],
  ]) {
    assert.equal(formatOutboundMessage(channel, ' Update. ', identity), expected);
    assert.equal(formatOutboundMessage(channel, expected, identity), expected);
  }
  assert.equal(
    formatOutboundMessage('sms', 'Update from Amina Store.', shop),
    'Amina Store: Update from Amina Store.'
  );
});

test('every provider rejects missing identity, wrong openings and invalid content without network calls', async () => {
  await withProviders(async calls => {
    for (const [channel, send] of senders) {
      const valid = formatOutboundMessage(
        channel,
        'Invoice INV-12. View: https://store.test/invoice',
        shop
      );
      for (const [body, identity] of [
        [valid, undefined],
        [valid, { scope: 'company' }],
        [valid, { scope: 'company', companyName: ' ' }],
        [valid, { scope: 'company', companyName: 'Other Shop' }],
        [valid, { scope: 'platform' }],
        [valid, { scope: 'company', companyName: 'Amina Store\nFake' }],
        ['Your account at Amina Store has changed.', shop],
        [valid + '{{unknown}}', shop],
        [valid + '\\nBroken', shop],
        [valid + '\u0000', shop],
        [channel === 'sms' ? 'Amina Store: ' : 'Amina Store\n\n', shop],
      ]) {
        await assert.rejects(
          send(body, identity),
          error =>
            error instanceof DeliveryError &&
            isMessageContractError(error) &&
            error.permanent &&
            !error.accepted
        );
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('all provider interfaces preserve complete company, account and platform envelopes', async () => {
  await withProviders(async calls => {
    for (const [channel, send] of senders) {
      for (const identity of [
        shop,
        account,
        platform,
        { scope: 'company', companyName: 'Safi Market' },
      ]) {
        const body = formatOutboundMessage(
          channel,
          'Reference INV-12. View: https://store.test/invoice',
          identity
        );
        await send(body, identity);
        const call = calls.at(-1);
        assert.equal(call.message ?? call.text ?? call.caption, body);
      }
    }
    assert.equal(calls.length, 16);
  });
});

test('attachment limits include the envelope and fail permanently before sending', async () => {
  await withProviders(async calls => {
    for (const [, send] of senders.slice(2)) {
      const body = 'Amina Store\n\n' + 'a'.repeat(1024 - 'Amina Store\n\n'.length);
      await send(body, shop);
      await assert.rejects(
        send(body + 'a', shop),
        error =>
          isMessageContractError(error) &&
          error.message.includes('caption_too_long') &&
          error.permanent &&
          !error.accepted
      );
    }
    assert.equal(calls.length, 2);
  });
});
