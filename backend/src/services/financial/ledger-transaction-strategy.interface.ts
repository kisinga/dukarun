import { RequestContext } from '@vendure/core';

/**
 * Transaction types that can be posted to the ledger
 */
export enum TransactionType {
  PURCHASE = 'Purchase',
  SALE = 'Sale',
  PAYMENT_ALLOCATION = 'PaymentAllocation',
  SUPPLIER_PAYMENT = 'SupplierPayment',
  REFUND = 'Refund',
}

/**
 * Base transaction data that all strategies need
 */
export interface TransactionData {
  ctx: RequestContext;
  sourceId: string;
  channelId: number;
  [key: string]: any; // Allow additional properties for specific transaction types
}

/**
 * Result of posting a transaction
 */
export interface PostingResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
}

/**
 * Ledger Transaction Strategy Interface
 *
 * Defines the contract for posting different types of transactions to the ledger.
 * Each strategy handles a specific transaction type (purchase, sale, etc.)
 */
export interface LedgerTransactionStrategy {
  /**
   * Check if this strategy can handle the given transaction data
   */
  canHandle(data: TransactionData): boolean;

  /**
   * Get the transaction type this strategy handles
   */
  getTransactionType(): TransactionType;

  /**
   * Post the transaction to the ledger
   * Must be idempotent (same transaction posted twice = one entry)
   */
  post(data: TransactionData): Promise<PostingResult>;
}
