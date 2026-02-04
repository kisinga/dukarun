import { inject, Injectable } from '@angular/core';
import { ALLOCATE_BULK_PAYMENT, PAY_SINGLE_ORDER } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { CustomerStateService } from './customer-state.service';

/**
 * Customer Payment Service
 *
 * Handles payment allocation operations for customers.
 * Pure API layer for payment management.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerPaymentService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(CustomerStateService);

  /**
   * Record a bulk payment for a credit-approved customer
   * @param customerId - Customer ID
   * @param paymentAmount - Payment amount
   * @param referenceNumber - Payment reference number (optional)
   * @param orderIds - Optional array of specific order IDs to pay, if not provided pays all outstanding orders
   * @returns Payment allocation result or null if failed
   */
  async recordBulkPayment(
    customerId: string,
    paymentAmount: number,
    referenceNumber?: string,
    orderIds?: string[],
  ): Promise<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null> {
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      const input: any = {
        customerId,
        paymentAmount,
      };

      if (orderIds && orderIds.length > 0) {
        input.orderIds = orderIds;
      }

      const result = await client.mutate<{
        allocateBulkPayment: {
          ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
          remainingBalance: number;
          totalAllocated: number;
        };
      }>({
        mutation: ALLOCATE_BULK_PAYMENT,
        variables: { input },
      });

      if (result.error) {
        console.error('❌ GraphQL error:', result.error);
        const errorMessage = result.error.message || 'Unknown error';
        this.stateService.setError(`Failed to record payment: ${errorMessage}`);
        return null;
      }

      const paymentResult = result.data?.allocateBulkPayment;
      if (!paymentResult) {
        this.stateService.setError('Failed to record payment: No data returned.');
        return null;
      }

      console.log('✅ Bulk payment recorded:', {
        customerId,
        paymentAmount,
        referenceNumber,
        ordersPaid: paymentResult.ordersPaid.length,
        totalAllocated: paymentResult.totalAllocated,
        remainingBalance: paymentResult.remainingBalance,
      });

      // TODO: Store reference number in payment metadata if backend supports it
      // For now, the reference number is tracked but not stored

      return paymentResult;
    } catch (error: any) {
      console.error('❌ Bulk payment error:', error);
      this.stateService.setError(error.message || 'Failed to record payment');
      return null;
    }
  }

  /**
   * Pay a single credit order directly
   * @param orderId - Order ID to pay
   * @param paymentAmount - Payment amount in cents (optional, defaults to full outstanding)
   * @param paymentMethodCode - Payment method code (optional)
   * @param referenceNumber - Payment reference number (optional)
   * @param debitAccountCode - Ledger account to debit (optional; overrides method-based)
   * @returns Payment allocation result or null if failed
   */
  async paySingleOrder(
    orderId: string,
    paymentAmount?: number,
    paymentMethodCode?: string,
    referenceNumber?: string,
    debitAccountCode?: string,
  ): Promise<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null> {
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      const input: Record<string, unknown> = {
        orderId,
      };

      if (paymentAmount !== undefined) {
        input['paymentAmount'] = paymentAmount;
      }

      if (paymentMethodCode) {
        input['paymentMethodCode'] = paymentMethodCode;
      }

      if (referenceNumber) {
        input['referenceNumber'] = referenceNumber;
      }

      if (debitAccountCode) {
        input['debitAccountCode'] = debitAccountCode;
      }

      const result = await client.mutate<{
        paySingleOrder: {
          ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
          remainingBalance: number;
          totalAllocated: number;
        };
      }>({
        mutation: PAY_SINGLE_ORDER as any,
        variables: { input },
      });

      if (result.error) {
        console.error('❌ GraphQL error:', result.error);
        const errorMessage = result.error.message || 'Unknown error';
        this.stateService.setError(`Failed to pay order: ${errorMessage}`);
        return null;
      }

      const paymentResult = result.data?.paySingleOrder;
      if (!paymentResult) {
        this.stateService.setError('Failed to pay order: No data returned.');
        return null;
      }

      console.log('✅ Single order payment recorded:', {
        orderId,
        paymentAmount,
        paymentMethodCode,
        referenceNumber,
        ordersPaid: paymentResult.ordersPaid.length,
        totalAllocated: paymentResult.totalAllocated,
        remainingBalance: paymentResult.remainingBalance,
      });

      return paymentResult;
    } catch (error: any) {
      console.error('❌ Single order payment error:', error);
      this.stateService.setError(error.message || 'Failed to pay order');
      return null;
    }
  }
}
