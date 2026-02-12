import { Injectable, inject } from '@angular/core';
import {
  PAY_SINGLE_PURCHASE,
  GET_SUPPLIER_CREDIT_SUMMARY,
  ALLOCATE_BULK_SUPPLIER_PAYMENT,
  APPROVE_SUPPLIER_CREDIT,
  UPDATE_SUPPLIER_CREDIT_LIMIT,
  UPDATE_SUPPLIER_CREDIT_DURATION,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';

export interface PaySinglePurchaseResult {
  purchasesPaid: Array<{ purchaseId: string; purchaseReference: string; amountPaid: number }>;
  remainingBalance: number;
  totalAllocated: number;
  excessPayment: number;
}

export interface SupplierCreditSummary {
  supplierId: string;
  isSupplierCreditApproved: boolean;
  supplierCreditLimit: number;
  outstandingAmount: number;
  availableCredit: number;
  lastRepaymentDate?: string | null;
  lastRepaymentAmount: number;
  supplierCreditDuration: number;
}

export interface AllocateBulkSupplierPaymentResult {
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

  /**
   * Get supplier credit summary (outstanding, limit, etc.)
   */
  async getSupplierCreditSummary(supplierId: string): Promise<SupplierCreditSummary | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{ supplierCreditSummary: SupplierCreditSummary }>({
        query: GET_SUPPLIER_CREDIT_SUMMARY as any,
        variables: { supplierId },
      });

      if (result.error) {
        console.error('Supplier credit summary error:', result.error);
        return null;
      }

      const data = result.data?.supplierCreditSummary;
      if (!data) return null;
      return data;
    } catch (error: any) {
      console.error('Supplier credit summary error:', error);
      return null;
    }
  }

  /**
   * Allocate a bulk payment to a supplier's unpaid purchases
   * @param supplierId - Supplier ID
   * @param paymentAmount - Amount in cents
   * @param purchaseIds - Optional specific purchase IDs; if omitted, allocates to oldest unpaid
   * @param debitAccountCode - Optional ledger account to debit
   */
  async allocateBulkSupplierPayment(
    supplierId: string,
    paymentAmount: number,
    purchaseIds?: string[],
    debitAccountCode?: string,
  ): Promise<AllocateBulkSupplierPaymentResult | null> {
    try {
      const client = this.apolloService.getClient();
      const input: Record<string, unknown> = { supplierId, paymentAmount };
      if (purchaseIds?.length) input['purchaseIds'] = purchaseIds;
      if (debitAccountCode) input['debitAccountCode'] = debitAccountCode;

      const result = await client.mutate<{
        allocateBulkSupplierPayment: AllocateBulkSupplierPaymentResult;
      }>({
        mutation: ALLOCATE_BULK_SUPPLIER_PAYMENT as any,
        variables: { input },
      });

      if (result.error) {
        console.error('Allocate bulk supplier payment error:', result.error);
        return null;
      }

      const data = result.data?.allocateBulkSupplierPayment;
      if (!data) return null;
      return data;
    } catch (error: any) {
      console.error('Allocate bulk supplier payment error:', error);
      return null;
    }
  }

  /**
   * Approve or revoke supplier credit
   */
  async approveSupplierCredit(
    supplierId: string,
    approved: boolean,
    supplierCreditLimit?: number,
    supplierCreditDuration?: number,
  ): Promise<SupplierCreditSummary | null> {
    try {
      const client = this.apolloService.getClient();
      const input: Record<string, unknown> = { supplierId, approved };
      if (supplierCreditLimit !== undefined) input['supplierCreditLimit'] = supplierCreditLimit;
      if (supplierCreditDuration !== undefined)
        input['supplierCreditDuration'] = supplierCreditDuration;

      const result = await client.mutate<{ approveSupplierCredit: SupplierCreditSummary }>({
        mutation: APPROVE_SUPPLIER_CREDIT as any,
        variables: { input },
      });

      if (result.error) {
        console.error('Approve supplier credit error:', result.error);
        return null;
      }
      return result.data?.approveSupplierCredit ?? null;
    } catch (error: any) {
      console.error('Approve supplier credit error:', error);
      return null;
    }
  }

  /**
   * Update supplier credit limit
   */
  async updateSupplierCreditLimit(
    supplierId: string,
    supplierCreditLimit: number,
    supplierCreditDuration?: number,
  ): Promise<SupplierCreditSummary | null> {
    try {
      const client = this.apolloService.getClient();
      const input: Record<string, unknown> = { supplierId, supplierCreditLimit };
      if (supplierCreditDuration !== undefined)
        input['supplierCreditDuration'] = supplierCreditDuration;

      const result = await client.mutate<{ updateSupplierCreditLimit: SupplierCreditSummary }>({
        mutation: UPDATE_SUPPLIER_CREDIT_LIMIT as any,
        variables: { input },
      });

      if (result.error) {
        console.error('Update supplier credit limit error:', result.error);
        return null;
      }
      return result.data?.updateSupplierCreditLimit ?? null;
    } catch (error: any) {
      console.error('Update supplier credit limit error:', error);
      return null;
    }
  }

  /**
   * Update supplier credit duration
   */
  async updateSupplierCreditDuration(
    supplierId: string,
    supplierCreditDuration: number,
  ): Promise<SupplierCreditSummary | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<{
        updateSupplierCreditDuration: SupplierCreditSummary;
      }>({
        mutation: UPDATE_SUPPLIER_CREDIT_DURATION as any,
        variables: { input: { supplierId, supplierCreditDuration } },
      });

      if (result.error) {
        console.error('Update supplier credit duration error:', result.error);
        return null;
      }
      return result.data?.updateSupplierCreditDuration ?? null;
    } catch (error: any) {
      console.error('Update supplier credit duration error:', error);
      return null;
    }
  }
}
