import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  callbackMetadata,
  classifyStkResult,
  parseMpesaTime,
  queryStk,
  type MpesaPrivateConfig,
} from '../_shared/mpesa.ts';

type ProviderEvent = {
  id: string;
  event_type: 'stk_callback' | 'c2b_validation' | 'c2b_confirmation';
  payload: Record<string, unknown> | null;
  attempt_id: string | null;
  provider_account_id: string;
};

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

function authorized(req: Request): boolean {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const actual = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function wholeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('invalid_provider_amount');
  }
  return amount;
}

function providerTime(value: unknown): string {
  const occurredAt = parseMpesaTime(value);
  if (!occurredAt) throw new Error('invalid_provider_transaction_time');
  return occurredAt;
}

async function attemptConfig(attemptId: string): Promise<MpesaPrivateConfig> {
  const { data, error } = await db.rpc('mpesa_private_for_attempt', { p_attempt_id: attemptId });
  if (error || !data) throw new Error(error?.message ?? 'mpesa_attempt_config_missing');
  return data as MpesaPrivateConfig;
}

async function finishEvent(
  id: string,
  collectionId: string | null,
  code: string | null
): Promise<void> {
  const { error } = await db.rpc('mpesa_complete_provider_event', {
    p_event_id: id,
    p_collection_id: collectionId,
    p_result_code: code,
  });
  if (error) throw new Error(error.message);
}

async function retryEvent(id: string, error: unknown, terminal = false): Promise<void> {
  await db.rpc('mpesa_retry_provider_event', {
    p_event_id: id,
    p_error: error instanceof Error ? error.message : String(error),
    p_terminal: terminal,
  });
}

async function processStk(event: ProviderEvent): Promise<void> {
  if (!event.payload || !event.attempt_id) throw new Error('invalid_stk_event');
  const callback = (event.payload.Body as Record<string, unknown> | undefined)?.stkCallback as
    Record<string, unknown> | undefined;
  if (!callback) throw new Error('invalid_stk_callback');
  const resultCode = text(callback.ResultCode) || 'UNKNOWN';
  const description = text(callback.ResultDesc);
  if (resultCode !== '0') {
    const { error } = await db.rpc('mpesa_finalize_stk_terminal', {
      p_attempt_id: event.attempt_id,
      p_result_code: resultCode,
      p_description: description,
    });
    if (error) throw new Error(error.message);
    await finishEvent(event.id, null, resultCode);
    return;
  }

  const config = await attemptConfig(event.attempt_id);
  const query = await queryStk(config);
  const queryCode = text(query.ResultCode ?? query.ResponseCode) || 'QUERY_PENDING';
  if (queryCode !== '0') {
    await db.rpc('mpesa_record_query_pending', {
      p_attempt_id: event.attempt_id,
      p_result_code: queryCode,
      p_description:
        text(query.ResultDesc ?? query.ResponseDescription) || 'Provider query pending',
    });
    throw new Error(`provider_query_pending:${queryCode}`);
  }

  const metadata = callbackMetadata(event.payload);
  const receipt = text(metadata.get('MpesaReceiptNumber'));
  if (!receipt) throw new Error('successful_callback_missing_receipt');
  const { data, error } = await db.rpc('mpesa_finalize_stk_success', {
    p_attempt_id: event.attempt_id,
    p_provider_receipt: receipt,
    p_amount: wholeAmount(metadata.get('Amount')),
    p_occurred_at: providerTime(metadata.get('TransactionDate')),
    p_payer_phone: text(metadata.get('PhoneNumber') ?? config.payer_phone),
    p_payer_name: null,
  });
  if (error) throw new Error(error.message);
  const result = data as { collection_id?: string } | null;
  await finishEvent(event.id, result?.collection_id ?? null, '0');
}

async function processC2b(event: ProviderEvent): Promise<void> {
  if (!event.payload) throw new Error('provider_payload_purged_before_processing');
  if (event.event_type === 'c2b_validation') {
    await finishEvent(event.id, null, '0');
    return;
  }
  const payload = event.payload;
  const receipt = text(payload.TransID);
  if (!receipt) throw new Error('c2b_receipt_missing');
  const payerName = [payload.FirstName, payload.MiddleName, payload.LastName]
    .map(text)
    .filter(Boolean)
    .join(' ');
  const { data, error } = await db.rpc('mpesa_record_c2b_collection', {
    p_provider_account_id: event.provider_account_id,
    p_provider_receipt: receipt,
    p_amount: wholeAmount(payload.TransAmount),
    p_occurred_at: providerTime(payload.TransTime),
    p_payer_phone: text(payload.MSISDN),
    p_payer_name: payerName || null,
    p_account_reference: text(payload.BillRefNumber ?? payload.InvoiceNumber),
  });
  if (error) throw new Error(error.message);
  const result = data as { collection_id?: string; conflict?: string | null } | null;
  await finishEvent(event.id, result?.collection_id ?? null, result?.conflict ? 'CONFLICT' : '0');
}

async function processEvent(event: ProviderEvent): Promise<void> {
  try {
    if (event.event_type === 'stk_callback') await processStk(event);
    else await processC2b(event);
  } catch (error) {
    await retryEvent(event.id, error);
  }
}

async function processStatusQuery(attemptId: string): Promise<void> {
  try {
    const config = await attemptConfig(attemptId);
    const query = await queryStk(config);
    const code = text(query.ResultCode ?? query.ResponseCode) || 'QUERY_PENDING';
    const description =
      text(query.ResultDesc ?? query.ResponseDescription) || 'Provider query pending';
    if (code === '0') {
      const { data: callback, error: callbackError } = await db.rpc(
        'mpesa_latest_trusted_callback_payload',
        { p_attempt_id: attemptId }
      );
      if (callbackError) throw new Error(callbackError.message);
      const payload = callback as Record<string, unknown> | null | undefined;
      const metadata = payload ? callbackMetadata(payload) : new Map<string, unknown>();
      const receipt = text(metadata.get('MpesaReceiptNumber'));
      if (!receipt) {
        await db.rpc('mpesa_record_query_pending', {
          p_attempt_id: attemptId,
          p_result_code: '0',
          p_description: 'Payment reported successful; waiting for receipt callback',
        });
        return;
      }
      await db.rpc('mpesa_finalize_stk_success', {
        p_attempt_id: attemptId,
        p_provider_receipt: receipt,
        p_amount: wholeAmount(metadata.get('Amount')),
        p_occurred_at: providerTime(metadata.get('TransactionDate')),
        p_payer_phone: text(metadata.get('PhoneNumber') ?? config.payer_phone),
        p_payer_name: null,
      });
      return;
    }
    if (classifyStkResult(code) === 'terminal') {
      await db.rpc('mpesa_finalize_stk_terminal', {
        p_attempt_id: attemptId,
        p_result_code: code,
        p_description: description,
      });
      return;
    }
    await db.rpc('mpesa_record_query_pending', {
      p_attempt_id: attemptId,
      p_result_code: code,
      p_description: description,
    });
  } catch (error) {
    await db.rpc('mpesa_record_query_pending', {
      p_attempt_id: attemptId,
      p_result_code: 'QUERY_ERROR',
      p_description: error instanceof Error ? error.message : String(error),
    });
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  if (!authorized(req)) return Response.json({ error: 'not_authorized' }, { status: 401 });

  const { data: events, error: eventError } = await db.rpc('mpesa_claim_provider_events', {
    p_limit: 25,
  });
  if (eventError) return Response.json({ error: 'claim_failed' }, { status: 500 });
  for (const event of (events ?? []) as ProviderEvent[]) await processEvent(event);

  const { data: attempts, error: queryError } = await db.rpc('mpesa_claim_status_queries', {
    p_limit: 25,
  });
  if (queryError) return Response.json({ error: 'query_claim_failed' }, { status: 500 });
  for (const attempt of attempts ?? []) await processStatusQuery(String(attempt.attempt_id));

  return Response.json({ events: events?.length ?? 0, queries: attempts?.length ?? 0 });
});
