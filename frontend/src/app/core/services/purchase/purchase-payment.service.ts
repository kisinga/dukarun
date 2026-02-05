import { Injectable, inject } from '@angular/core';
import { PAY_SINGLE_PURCHASE } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';

export interface PaySinglePurchaseResult {
  purchasesPaid: Array<{ purchaseId: string; purchaseReference: string; amountPaid: number }>;
  remainingBalance: number;
  totalAllocated: number;
  excessPayment: number;
}

/**
 * Purchase Payment Service
 *
 * Handles payment operations for credit purchases (pay single purchase).
 * Reuses same eligible-accounts and allocation result shape as order payments.
 */
@Injectable({
  providedIn: 'root',
})
export class PurchasePaymentService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Pay a single credit purchase
   * @param purchaseId - Purchase ID to pay
   * @param paymentAmount - Amount in cents (optional, defaults to full outstanding)
   * @param debitAccountCode - Account to pay from (optional)
   * @returns Allocation result or null if failed
   */
  async paySinglePurchase(
    purchaseId: string,
    paymentAmount?: number,
    debitAccountCode?: string,
  ): Promise<PaySinglePurchaseResult | null> {
    try {
      const client = this.apolloService.getClient();
      const input: Record<string, unknown> = { purchaseId };
      if (paymentAmount !== undefined) input['paymentAmount'] = paymentAmount;
      if (debitAccountCode) input['debitAccountCode'] = debitAccountCode;

      const result = await client.mutate<{ paySinglePurchase: PaySinglePurchaseResult }>({
        mutation: PAY_SINGLE_PURCHASE as any,
        variables: { input },
      });

      if (result.error) {
        console.error('Pay single purchase error:', result.error);
        return null;
      }

      const data = result.data?.paySinglePurchase;
      if (!data) return null;
      return data;
    } catch (error: any) {
      console.error('Pay single purchase error:', error);
      return null;
    }
  }
}
