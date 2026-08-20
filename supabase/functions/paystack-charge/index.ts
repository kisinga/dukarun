// paystack-charge: initiate a subscription payment via M-Pesa STK push.
// POST { tier_id, billing_cycle, phone } with a user JWT.
// The company comes from the JWT claims — never from the client.
// Replaces archive/vendure/backend/src/services/payments/paystack.service.ts (one-off charge model).

import { createClient } from 'npm:@supabase/supabase-js@2';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
if (!PAYSTACK_SECRET) {
  // Fail closed: without the secret we cannot call Paystack.
  throw new Error('PAYSTACK_SECRET_KEY is not set');
}
const SYSTEM_EMAIL = Deno.env.get('PAYSTACK_SYSTEM_EMAIL') ?? 'billing@dukarun.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'not_authenticated' }, { status: 401, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return Response.json({ error: 'not_authenticated' }, { status: 401, headers: cors });
    }

    const { tier_id, billing_cycle, phone } = await req.json();
    if (!tier_id || !['monthly', 'yearly'].includes(billing_cycle) || !phone) {
      return Response.json({ error: 'invalid_input' }, { status: 400, headers: cors });
    }

    // Company + tier, RLS-scoped to the caller.
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, status, subscription_status, last_payment_reference')
      .limit(1);
    const company = companies?.[0];
    if (!company) {
      return Response.json({ error: 'no_company' }, { status: 400, headers: cors });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: tier } = await serviceClient
      .from('subscription_tiers')
      .select('id, code, name, price_monthly, price_yearly')
      .eq('id', tier_id)
      .eq('is_active', true)
      .single();

    if (!tier) {
      return Response.json({ error: 'tier_not_found' }, { status: 404, headers: cors });
    }

    const { data: billingPolicy } = await serviceClient
      .from('platform_billing_settings')
      .select('new_customer_tier_id, testing_access_months')
      .eq('singleton', true)
      .single();

    const initialPurchase =
      billing_cycle === 'monthly' &&
      billingPolicy?.new_customer_tier_id === tier.id &&
      company.status === 'approved' &&
      company.subscription_status === null &&
      company.last_payment_reference === null;
    if (company.subscription_status === null && !initialPurchase) {
      return Response.json(
        { error: 'initial_purchase_requires_configured_monthly_tier' },
        { status: 400, headers: cors }
      );
    }
    const amount = initialPurchase
      ? tier.price_monthly
      : billing_cycle === 'yearly'
        ? tier.price_yearly
        : tier.price_monthly;
    const normalizedPhone = phone.replace(/[^\d]/g, '').replace(/^0/, '254');
    let paymentReference: string | undefined;

    if (initialPurchase) {
      const testingAccessMonths = billingPolicy!.testing_access_months;
      const { data: pendingAttempt, error: pendingError } = await serviceClient
        .from('initial_subscription_payment_attempts')
        .select('payment_reference, created_at')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingError) throw pendingError;

      if (pendingAttempt) {
        const ageMs = Date.now() - Date.parse(pendingAttempt.created_at);
        let terminalStatus: string | null = null;
        if (ageMs >= 10_000) {
          try {
            const verifyRes = await fetch(
              `https://api.paystack.co/transaction/verify/${encodeURIComponent(pendingAttempt.payment_reference)}`,
              { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
            );
            const verifyBody = await verifyRes.json();
            const status = verifyBody.data?.status;
            if (['failed', 'timeout', 'abandoned', 'reversed'].includes(status)) {
              terminalStatus = status;
            }
          } catch {
            // An inconclusive provider check must not permit a competing charge.
          }
        }

        if (terminalStatus) {
          const { error: failedError } = await serviceClient
            .from('initial_subscription_payment_attempts')
            .update({
              status: 'failed',
              failure_reason: `paystack_${terminalStatus}`,
              updated_at: new Date().toISOString(),
            })
            .eq('payment_reference', pendingAttempt.payment_reference)
            .eq('status', 'pending');
          if (failedError) throw failedError;
        } else {
          return Response.json(
            {
              status: 'pending',
              reference: pendingAttempt.payment_reference,
              display_text:
                'Your first payment is still pending. Complete the prompt on your phone.',
            },
            { headers: cors }
          );
        }
      }

      paymentReference = `DUK-INIT-${crypto.randomUUID().replaceAll('-', '')}`;
      const { error: reservationError } = await serviceClient.rpc(
        'reserve_initial_subscription_payment',
        {
          p_company_id: company.id,
          p_tier_id: tier.id,
          p_reference: paymentReference,
          p_amount: amount,
          p_testing_access_months: testingAccessMonths,
        }
      );
      if (reservationError) {
        const status = reservationError.message.includes('initial_purchase_payment_pending')
          ? 409
          : 400;
        return Response.json({ error: reservationError.message }, { status, headers: cors });
      }
    }

    const res = await fetch('https://api.paystack.co/charge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: SYSTEM_EMAIL,
        amount: amount * 100, // Paystack expects the smallest currency unit; we store shillings
        currency: 'KES',
        ...(paymentReference ? { reference: paymentReference } : {}),
        mobile_money: { phone: `+${normalizedPhone}`, provider: 'mpesa' },
        metadata: {
          type: initialPurchase ? 'subscription_initial_purchase' : 'subscription',
          company_id: company.id,
          tier_id: tier.id,
          billing_cycle,
          ...(initialPurchase
            ? {
                unit_price: tier.price_monthly,
                testing_access_months: billingPolicy!.testing_access_months,
              }
            : {}),
        },
      }),
    });

    const result = await res.json();
    const resultStatus = result.data?.status;
    const terminalFailure = ['failed', 'timeout', 'abandoned', 'reversed'].includes(resultStatus);
    if (!res.ok || !result.status || terminalFailure) {
      if (paymentReference && (res.status < 500 || terminalFailure)) {
        const { error: failedError } = await serviceClient
          .from('initial_subscription_payment_attempts')
          .update({
            status: 'failed',
            failure_reason: resultStatus ?? result.code ?? `http_${res.status}`,
            updated_at: new Date().toISOString(),
          })
          .eq('payment_reference', paymentReference)
          .eq('status', 'pending');
        if (failedError) console.error('failed to close initial payment attempt', failedError);
      }
      return Response.json(
        { error: result.message ?? 'paystack_error' },
        { status: 502, headers: cors }
      );
    }
    if (paymentReference && result.data?.reference !== paymentReference) {
      console.error('paystack reference mismatch', {
        requested: paymentReference,
        returned: result.data?.reference,
      });
      return Response.json(
        { error: 'paystack_reference_mismatch' },
        { status: 502, headers: cors }
      );
    }

    // charge with mobile_money returns a pending transaction; completion
    // arrives via the webhook (charge.success) which activates the subscription.
    return Response.json(
      {
        status: result.data?.status,
        reference: result.data?.reference,
        display_text: result.data?.display_text ?? 'Check your phone for the M-Pesa prompt',
      },
      { headers: cors }
    );
  } catch (err) {
    console.error('paystack-charge failed', err);
    return Response.json({ error: 'internal_error' }, { status: 500, headers: cors });
  }
});
