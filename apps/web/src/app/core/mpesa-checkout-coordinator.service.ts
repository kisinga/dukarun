import { Injectable, inject } from '@angular/core';
import { MpesaService, type MpesaIntentResult } from './mpesa.service';

export type MpesaCheckoutOutcome =
  | { kind: 'completed'; intentId: string; subjectId: string; receipt: string | null }
  | { kind: 'awaiting_cash'; intentId: string; subjectId: string; cashAmount: number }
  | { kind: 'pending'; intentId: string; subjectId: string; message: string }
  | { kind: 'manual_review'; intentId: string; subjectId: string; message: string }
  | {
      kind: 'failed';
      intentId: string;
      subjectId: string;
      message: string;
      retryAllowed: boolean;
    };

export function mpesaCheckoutOutcome(
  intentId: string,
  result: MpesaIntentResult
): MpesaCheckoutOutcome {
  if (result.status === 'completed') {
    return {
      kind: 'completed',
      intentId,
      subjectId: result.subject_id,
      receipt: result.provider_receipt,
    };
  }
  if (result.status === 'awaiting_cash') {
    return {
      kind: 'awaiting_cash',
      intentId,
      subjectId: result.subject_id,
      cashAmount: result.cash_amount,
    };
  }
  if (result.status === 'manual_review') {
    return {
      kind: 'manual_review',
      intentId,
      subjectId: result.subject_id,
      message: 'M-PESA was received, but posting needs review. Do not charge the customer again.',
    };
  }
  if (['created', 'requesting', 'pending', 'funds_received'].includes(result.status)) {
    return {
      kind: 'pending',
      intentId,
      subjectId: result.subject_id,
      message:
        result.status === 'funds_received'
          ? 'M-PESA was received and is still posting. Do not charge the customer again.'
          : 'M-PESA is still pending. Check the customer phone before retrying.',
    };
  }
  return {
    kind: 'failed',
    intentId,
    subjectId: result.subject_id,
    message: result.retry_allowed
      ? `${result.result_description || `M-PESA payment ${result.status.replaceAll('_', ' ')}`}. Confirm payment again to send a new STK prompt.`
      : result.result_description || `M-PESA payment ${result.status.replaceAll('_', ' ')}`,
    retryAllowed: result.retry_allowed,
  };
}

@Injectable({ providedIn: 'root' })
export class MpesaCheckoutCoordinator {
  private readonly mpesa = inject(MpesaService);

  async run(
    start: (retry: boolean) => Promise<string>,
    explicitRetry = false
  ): Promise<MpesaCheckoutOutcome> {
    const intentId = await start(explicitRetry);
    return mpesaCheckoutOutcome(intentId, await this.mpesa.waitForResult(intentId));
  }

  finalizeCash(intentId: string): Promise<string> {
    return this.mpesa.finalizeCashSplit(intentId);
  }
}
