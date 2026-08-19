import { describe, expect, it } from 'vitest';
import { mpesaCheckoutOutcome } from './mpesa-checkout-coordinator.service';
import type { MpesaIntentResult, MpesaIntentStatus } from './mpesa.service';

function result(status: MpesaIntentStatus, description: string | null = null): MpesaIntentResult {
  return {
    id: 'intent-1',
    subject_id: 'order-1',
    status,
    result_code: null,
    result_description: description,
    provider_receipt: 'RCP1234567',
    cash_amount: 20,
    amount: 80,
    retry_allowed: false,
  };
}

describe('M-PESA checkout outcomes', () => {
  it('returns completed with the provider receipt', () => {
    expect(mpesaCheckoutOutcome('intent-1', result('completed'))).toEqual({
      kind: 'completed',
      intentId: 'intent-1',
      subjectId: 'order-1',
      receipt: 'RCP1234567',
    });
  });

  it('returns only the authoritative cash balance for a split', () => {
    expect(mpesaCheckoutOutcome('intent-1', result('awaiting_cash'))).toMatchObject({
      kind: 'awaiting_cash',
      cashAmount: 20,
    });
  });

  it.each(['created', 'requesting', 'pending'] as const)('keeps %s pending', status => {
    expect(mpesaCheckoutOutcome('intent-1', result(status)).kind).toBe('pending');
  });

  it('warns against retry after funds are received', () => {
    const outcome = mpesaCheckoutOutcome('intent-1', result('funds_received'));
    expect(outcome.kind).toBe('pending');
    expect('message' in outcome && outcome.message).toContain('Do not charge');
  });

  it('uses a no-retry message for manual review', () => {
    const outcome = mpesaCheckoutOutcome('intent-1', result('manual_review'));
    expect(outcome.kind).toBe('manual_review');
    expect('message' in outcome && outcome.message).toContain('Do not charge');
  });

  it.each(['cancelled', 'expired', 'failed'] as const)('maps %s to failed', status => {
    expect(mpesaCheckoutOutcome('intent-1', result(status, 'Not paid'))).toMatchObject({
      kind: 'failed',
      message: 'Not paid',
      retryAllowed: false,
    });
  });

  it('requires a deliberate retry after a terminal result', () => {
    const retryable = { ...result('failed', 'Request declined'), retry_allowed: true };
    expect(mpesaCheckoutOutcome('intent-1', retryable)).toMatchObject({
      kind: 'failed',
      retryAllowed: true,
      message: expect.stringContaining('Confirm payment again'),
    });
  });
});
