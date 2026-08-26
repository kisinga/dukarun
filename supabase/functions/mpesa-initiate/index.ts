import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  callbackBaseUrl,
  classifyStkResult,
  cors,
  initiateStk,
  json,
  normalizePhone,
  sha256,
  type MpesaPrivateConfig,
} from '../_shared/mpesa.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } }
  );
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: 'not_authenticated' }, 401);

  let attemptId: string | null = null;
  try {
    const input = await req.json();
    const manual = input.mode === 'manual';
    const phone = manual ? null : normalizePhone(input.phone);
    if (manual && input.workflow === 'cod_order') {
      throw new Error('manual_fallback_not_available');
    }
    const preparedRequest =
      input.workflow === 'cod_order'
        ? userClient.rpc('prepare_cod_mpesa_checkout', {
            p_fulfillment_id: input.fulfillment_id,
            p_phone: phone,
            p_amount: Math.round(Number(input.amount)),
            p_cash_amount: Math.round(Number(input.cash_amount ?? 0)),
            p_client_ref: input.client_ref ?? null,
            p_retry: input.retry === true,
          })
        : input.workflow === 'fulfillment_sale'
          ? userClient.rpc('prepare_mpesa_fulfillment_checkout', {
              p_location_id: input.location_id,
              p_customer: input.customer ?? {},
              p_lines: input.lines ?? null,
              p_fulfillment: input.fulfillment ?? {},
              p_phone: phone,
              p_amount: Math.round(Number(input.amount)),
              p_cash_amount: Math.round(Number(input.cash_amount ?? 0)),
              p_client_ref: input.client_ref ?? null,
              p_draft_id: input.draft_id ?? null,
              p_retry: input.retry === true,
            })
          : userClient.rpc('prepare_mpesa_checkout', {
              p_workflow: input.workflow,
              p_location_id: input.location_id,
              p_phone: phone,
              p_amount: Math.round(Number(input.amount)),
              p_cash_amount: Math.round(Number(input.cash_amount ?? 0)),
              p_client_ref: input.client_ref ?? null,
              p_customer_id: input.customer_id ?? null,
              p_lines: input.lines ?? null,
              p_order_id: input.order_id ?? null,
              p_draft_id: input.draft_id ?? null,
              p_retry: input.retry === true,
            });
    const { data: prepared, error: intentError } = await preparedRequest;
    if (intentError) throw new Error(intentError.message);
    const checkout = prepared as {
      intent_id: string;
      subject_id: string;
      action: 'send_prompt' | 'poll' | 'await_cash' | 'completed' | 'review' | 'retryable';
      state: string;
      attempt_id?: string | null;
      cash_amount?: number;
      message?: string | null;
    };
    const intentId = checkout.intent_id;

    if (manual) {
      if (checkout.action !== 'send_prompt') {
        return json({ ...checkout, status: checkout.state });
      }
      const { data: result, error } = await userClient.rpc('declare_mpesa_manual_fallback', {
        p_intent_id: intentId,
        p_provider_receipt: String(input.receipt ?? ''),
      });
      if (error) throw new Error(error.message);
      return json({ intent_id: intentId, status: result?.status ?? 'pending' });
    }

    if (checkout.action !== 'send_prompt') {
      // These are valid checkout states, not transport failures. Returning a
      // success response lets every client render the same server state and
      // require an explicit user action before p_retry=true is sent.
      return json({ ...checkout, status: checkout.state });
    }

    const callbackToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    const { data: createdAttempt, error: attemptError } = await userClient.rpc(
      'create_mpesa_payment_attempt',
      { p_intent_id: intentId, p_callback_token_hash: await sha256(callbackToken) }
    );
    if (attemptError) throw new Error(attemptError.message);
    attemptId = createdAttempt;

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: privateConfig, error: privateError } = await serviceClient.rpc(
      'mpesa_private_for_attempt',
      { p_attempt_id: attemptId }
    );
    if (privateError || !privateConfig)
      throw new Error(privateError?.message ?? 'mpesa_config_missing');

    const callbackBase = callbackBaseUrl(privateConfig as MpesaPrivateConfig);
    const callbackUrl = `${callbackBase}/mpesa-callback?kind=stk&token=${encodeURIComponent(callbackToken)}`;
    let provider: Record<string, unknown>;
    try {
      provider = await initiateStk(privateConfig as MpesaPrivateConfig, callbackUrl);
    } catch (providerError) {
      await serviceClient.rpc('mpesa_record_request_unknown', {
        p_attempt_id: attemptId,
        p_description:
          providerError instanceof Error ? providerError.message : 'STK request outcome unknown',
      });
      return json(
        {
          intent_id: intentId,
          attempt_id: attemptId,
          status: 'pending',
          message: 'The request outcome is not yet known. Check the phone and do not retry.',
        },
        202
      );
    }
    const responseCode = String(provider.ResponseCode ?? 'REQUEST_FAILED');
    const recorded = await serviceClient.rpc('mpesa_record_stk_request', {
      p_attempt_id: attemptId,
      p_merchant_request_id: String(provider.MerchantRequestID ?? ''),
      p_checkout_request_id: String(provider.CheckoutRequestID ?? ''),
      p_response_code: responseCode,
      p_response_description: String(provider.ResponseDescription ?? ''),
      p_customer_message: String(provider.CustomerMessage ?? ''),
    });
    if (recorded.error) {
      await serviceClient.rpc('mpesa_record_request_unknown', {
        p_attempt_id: attemptId,
        p_description: `Provider accepted the request but local persistence failed: ${recorded.error.message}`,
      });
      return json(
        {
          intent_id: intentId,
          attempt_id: attemptId,
          status: 'pending',
          message: 'The request is still being checked. Do not retry or pay again.',
        },
        202
      );
    }
    if (responseCode !== '0') {
      if (classifyStkResult(responseCode) === 'pending') {
        return json(
          {
            intent_id: intentId,
            attempt_id: attemptId,
            status: 'pending',
            message: 'The request outcome is not yet known. Do not retry or pay again.',
          },
          202
        );
      }
      return json({
        intent_id: intentId,
        attempt_id: attemptId,
        status:
          responseCode === '1032' ? 'cancelled' : responseCode === '1037' ? 'expired' : 'failed',
        message: provider.ResponseDescription,
      });
    }
    return json({
      intent_id: intentId,
      attempt_id: attemptId,
      status: 'pending',
      message: provider.CustomerMessage ?? 'Check the phone and enter the M-PESA PIN.',
    });
  } catch (error) {
    if (attemptId) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await serviceClient.rpc('mpesa_record_request_unknown', {
        p_attempt_id: attemptId,
        p_description: error instanceof Error ? error.message : 'STK request outcome unknown',
      });
    }
    const message = error instanceof Error ? error.message : 'stk_request_failed';
    const status = message.includes('not_available') ? 409 : message.includes('retry') ? 429 : 400;
    return json({ error: 'stk_request_failed', message }, status);
  }
});
