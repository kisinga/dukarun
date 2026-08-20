import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeliveryError,
  normalizeWhatsappPhone,
  sendWhatsappImage,
} from '../../supabase/functions/_shared/message-providers.ts';
import {
  platformSalesInvitationCaption,
  platformSalesInvitationUrl,
} from '../../supabase/functions/_shared/sales-invitation.ts';

test('sales invitation media caption carries both the permanent code and registration link', () => {
  const invitationUrl = platformSalesInvitationUrl('https://app.dukarun.com/', 'AMINA_7');
  const caption = platformSalesInvitationCaption(
    { name: 'Amina', invitation_code: 'AMINA_7' },
    invitationUrl
  );

  assert.equal(invitationUrl, 'https://app.dukarun.com/register?sales_code=AMINA_7');
  assert.match(caption, /Invitation code: \*AMINA_7\*/);
  assert.match(caption, /Register here: https:\/\/app\.dukarun\.com\/register\?sales_code=AMINA_7/);
});

test('WhatsApp image delivery uses the OpenWA media endpoint with a caption', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.Deno = {
    env: {
      get(name) {
        return {
          OPENWA_BASE_URL: 'https://openwa.example.test',
          OPENWA_API_KEY: 'test-key',
          OPENWA_SESSION: 'sales-session',
        }[name];
      },
    },
  };
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await sendWhatsappImage('0712 345 678', 'cG5nLWJ5dGVz', 'Invitation caption');
  } finally {
    globalThis.Deno = originalDeno;
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    request.url,
    'https://openwa.example.test/api/sessions/sales-session/messages/send-image'
  );
  assert.deepEqual(JSON.parse(request.init.body), {
    chatId: '254712345678@c.us',
    base64: 'cG5nLWJ5dGVz',
    mimetype: 'image/png',
    filename: 'dukarun-invitation.png',
    caption: 'Invitation caption',
  });
});

test('WhatsApp recipient normalization accepts E.164/local formatting and rejects malformed input', () => {
  assert.equal(normalizeWhatsappPhone('0712 345 678'), '254712345678');
  assert.equal(normalizeWhatsappPhone('+254 (712) 345-678'), '254712345678');
  assert.equal(normalizeWhatsappPhone('phone: 0712345678'), null);
  assert.equal(normalizeWhatsappPhone('1234'), null);
});

test('OpenWA transport failures retain the acceptance-unknown signal', async () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  globalThis.Deno = {
    env: {
      get(name) {
        return {
          OPENWA_BASE_URL: 'https://openwa.example.test',
          OPENWA_API_KEY: 'test-key',
          OPENWA_SESSION: 'sales-session',
        }[name];
      },
    },
  };
  globalThis.fetch = async () => {
    throw new TypeError('connection closed');
  };

  try {
    await assert.rejects(
      sendWhatsappImage('+254712345678', 'cG5nLWJ5dGVz', 'Invitation caption'),
      error => error instanceof DeliveryError && error.accepted && !error.permanent
    );
  } finally {
    globalThis.Deno = originalDeno;
    globalThis.fetch = originalFetch;
  }
});
