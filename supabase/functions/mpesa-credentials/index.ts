import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  callbackBaseUrl,
  classifyStkResult,
  cors,
  darajaAccessToken,
  darajaBase,
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
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const input = await req.json();
    const action = String(input.action ?? '');
    if (action === 'configure') {
      const { data, error } = await userClient.rpc('platform_configure_mpesa_connection', {
        p_request_id: input.request_id,
        p_app_name: input.app_name,
        p_environment: input.environment,
        p_organization_shortcode: input.organization_shortcode,
        p_business_shortcode: input.business_shortcode,
        p_party_b: input.party_b,
        p_consumer_key: input.consumer_key ?? null,
        p_consumer_secret: input.consumer_secret ?? null,
        p_passkey: input.passkey,
        p_daraja_app_id: input.daraja_app_id ?? null,
      });
      if (error) throw error;
      return json({ connection_id: data, status: 'configured' });
    }

    if (action === 'settings') {
      const { error } = await userClient.rpc('platform_set_mpesa_settings', {
        p_enabled: Boolean(input.enabled),
        p_manual_fallback_allowed: Boolean(input.manual_fallback_allowed),
        p_pilot_company_id: input.pilot_company_id ?? null,
        p_safaricom_authorization_email: input.safaricom_authorization_email ?? null,
        p_dukarun_mpesa_contact_name: input.dukarun_mpesa_contact_name ?? null,
        p_dukarun_mpesa_contact_email: input.dukarun_mpesa_contact_email ?? null,
        p_dukarun_mpesa_contact_phone: input.dukarun_mpesa_contact_phone ?? null,
        p_mpesa_callback_base_url: input.mpesa_callback_base_url ?? null,
      });
      if (error) throw error;
      return json({ status: 'updated' });
    }

    // Authorize before any service-role credential read or Daraja request.
    const guard = await userClient.rpc('platform_mpesa_overview');
    if (guard.error) throw guard.error;
    const connectionId = String(input.connection_id ?? '');
    if (!connectionId) return json({ error: 'connection_id_required' }, 400);

    if (['validate_credentials', 'register_c2b', 'test_stk'].includes(action)) {
      const { data: config, error } = await serviceClient.rpc('mpesa_private_connection', {
        p_connection_id: connectionId,
      });
      if (error || !config) throw new Error(error?.message ?? 'mpesa_connection_not_found');
      const privateConfig = config as MpesaPrivateConfig;

      if (action === 'validate_credentials') {
        await darajaAccessToken(privateConfig);
        const result = await userClient.rpc('platform_update_mpesa_connection', {
          p_connection_id: connectionId,
          p_action: 'credentials_verified',
          p_notes: 'Daraja OAuth succeeded',
          p_fallback_until: null,
          p_collection_id: null,
        });
        if (result.error) throw result.error;
        return json({ status: 'credentials_verified' });
      }

      const callbackBase = callbackBaseUrl(privateConfig);

      if (action === 'test_stk') {
        const callbackToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
        const attempt = await userClient.rpc('platform_create_mpesa_test_attempt', {
          p_connection_id: connectionId,
          p_phone: normalizePhone(String(input.phone ?? '')),
          p_amount: 1,
          p_callback_token_hash: await sha256(callbackToken),
        });
        if (attempt.error) throw attempt.error;
        const attemptConfig = await serviceClient.rpc('mpesa_private_for_attempt', {
          p_attempt_id: attempt.data,
        });
        if (attemptConfig.error || !attemptConfig.data)
          throw new Error('mpesa_test_config_missing');
        let provider: Record<string, unknown>;
        try {
          provider = await initiateStk(
            attemptConfig.data as MpesaPrivateConfig,
            `${callbackBase}/mpesa-callback?kind=stk&token=${encodeURIComponent(callbackToken)}`
          );
        } catch (error) {
          await serviceClient.rpc('mpesa_record_request_unknown', {
            p_attempt_id: attempt.data,
            p_description: error instanceof Error ? error.message : 'STK test outcome unknown',
          });
          throw error;
        }
        const record = await serviceClient.rpc('mpesa_record_stk_request', {
          p_attempt_id: attempt.data,
          p_merchant_request_id: String(provider.MerchantRequestID ?? ''),
          p_checkout_request_id: String(provider.CheckoutRequestID ?? ''),
          p_response_code: String(provider.ResponseCode ?? 'REQUEST_FAILED'),
          p_response_description: String(provider.ResponseDescription ?? ''),
          p_customer_message: String(provider.CustomerMessage ?? ''),
        });
        if (record.error) {
          await serviceClient.rpc('mpesa_record_request_unknown', {
            p_attempt_id: attempt.data,
            p_description: `Provider accepted the test but local persistence failed: ${record.error.message}`,
          });
          return json(
            {
              status: 'pending',
              attempt_id: attempt.data,
              message: 'The KES 1 test outcome is still being checked. Do not retry.',
            },
            202
          );
        }
        if (String(provider.ResponseCode ?? 'REQUEST_FAILED') !== '0') {
          if (classifyStkResult(String(provider.ResponseCode ?? 'REQUEST_FAILED')) === 'pending') {
            return json(
              {
                status: 'pending',
                attempt_id: attempt.data,
                message: 'The KES 1 test outcome is still being checked. Do not retry.',
              },
              202
            );
          }
          throw new Error(String(provider.ResponseDescription ?? 'STK test request failed'));
        }
        return json({ status: 'test_prompt_sent', attempt_id: attempt.data });
      }

      const callbackToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
      const pending = await userClient.rpc('platform_prepare_mpesa_c2b_token', {
        p_connection_id: connectionId,
        p_callback_token_hash: await sha256(callbackToken),
      });
      if (pending.error) throw pending.error;
      try {
        const accessToken = await darajaAccessToken(privateConfig);
        const response = await fetch(
          `${darajaBase(privateConfig.environment)}/mpesa/c2b/v1/registerurl`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ShortCode: privateConfig.organization_shortcode,
              ResponseType: 'Completed',
              ConfirmationURL: `${callbackBase}/mpesa-callback?kind=c2b-confirmation&token=${encodeURIComponent(callbackToken)}`,
              ValidationURL: `${callbackBase}/mpesa-callback?kind=c2b-validation&token=${encodeURIComponent(callbackToken)}`,
            }),
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || String(body.ResponseCode ?? '0') !== '0') {
          throw new Error(
            String(body.errorMessage ?? body.ResponseDescription ?? 'c2b_registration_failed')
          );
        }
        const activation = await userClient.rpc('platform_activate_mpesa_c2b_token', {
          p_token_id: pending.data,
        });
        if (activation.error) throw activation.error;
        return json({ status: 'c2b_registered' });
      } catch (error) {
        await userClient.rpc('platform_cancel_mpesa_c2b_token', { p_token_id: pending.data });
        throw error;
      }
    }

    const mappedAction = {
      start_testing: 'testing',
      mark_c2b_test: 'c2b_test_passed',
      activate: 'activate',
      disable: 'disable',
      set_fallback: 'set_fallback',
    }[action];
    if (!mappedAction) return json({ error: 'invalid_action' }, 400);
    const { error } = await userClient.rpc('platform_update_mpesa_connection', {
      p_connection_id: connectionId,
      p_action: mappedAction,
      p_notes: input.notes ?? null,
      p_fallback_until: input.fallback_until ?? null,
      p_collection_id: input.collection_id ?? null,
    });
    if (error) throw error;
    return json({ status: mappedAction });
  } catch (error) {
    return json(
      {
        error: 'mpesa_admin_action_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      400
    );
  }
});
