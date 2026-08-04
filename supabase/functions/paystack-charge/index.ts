// paystack-charge: initiate a subscription payment via M-Pesa STK push.
// POST { tier_id, billing_cycle, phone } with a user JWT.
// The company comes from the JWT claims — never from the client.
// Replaces archive/vendure/backend/src/services/payments/paystack.service.ts (one-off charge model).

import { createClient } from 'npm:@supabase/supabase-js@2';

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
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
    const { data: companies } = await supabase.from('companies').select('id, name').limit(1);
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

    const amount = billing_cycle === 'yearly' ? tier.price_yearly : tier.price_monthly;
    const normalizedPhone = phone.replace(/[^\d]/g, '').replace(/^0/, '254');

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
        mobile_money: { phone: `+${normalizedPhone}`, provider: 'mpesa' },
        metadata: {
          type: 'subscription',
          company_id: company.id,
          tier_id: tier.id,
          billing_cycle,
        },
      }),
    });

    const result = await res.json();
    if (!res.ok || !result.status) {
      return Response.json(
        { error: result.message ?? 'paystack_error' },
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
    return Response.json(
      { error: err instanceof Error ? err.message : 'internal_error' },
      { status: 500, headers: cors }
    );
  }
});
