import { Injectable } from '@nestjs/common';
import { Order, Payment, RequestContext } from '@vendure/core';
import { ACCOUNT_CODES } from '../../../ledger/account-codes.constants';
import { BaseTransactionStrategy } from '../base-transaction-strategy';
import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { LedgerPostingService } from '../ledger-posting.service';
import { LedgerQueryService } from '../ledger-query.service';
import {
  PaymentPostingContext,
  SalePostingContext,
  createCreditSaleEntry,
  createPaymentEntry,
} from '../posting-policy';
import {
  PostingResult,
  TransactionData,
  TransactionType,
} from '../ledger-transaction-strategy.interface';
import { mapPaymentMethodToAccount } from '../payment-method-mapping.config';

/**
 * Sale Transaction Data (Credit Sale)
 */
export interface CreditSaleTransactionData extends TransactionData {
  order: Order;
  isCreditSale: true;
}

/**
 * Sale Transaction Data (Cash Sale - Payment)
 */
export interface CashSaleTransactionData extends TransactionData {
  payment: Payment;
  order: Order;
  isCreditSale: false;
}

export type SaleTransactionData = CreditSaleTransactionData | CashSaleTransactionData;

/**
 * Sale Posting Strategy
 *
 * Handles posting of sale transactions (both credit and cash sales) to the ledger.
 * - Credit Sale: Debit ACCOUNTS_RECEIVABLE, Credit SALES
 * - Cash Sale: Debit CASH_ON_HAND/CLEARING, Credit SALES
 */
@Injectable()
export class SalePostingStrategy extends BaseTransactionStrategy {
  constructor(
    postingService: LedgerPostingService,
    queryService: LedgerQueryService,
    private readonly chartOfAccountsService: ChartOfAccountsService
  ) {
    super(postingService, queryService, 'SalePostingStrategy');
  }

  canHandle(data: TransactionData): boolean {
    // Can handle if it's a credit sale (has order and isCreditSale flag)
    if ('order' in data && 'isCreditSale' in data && data.isCreditSale === true) {
      return true;
    }
    // Can handle if it's a cash sale (has payment and order)
    if (
      'payment' in data &&
      'order' in data &&
      'isCreditSale' in data &&
      data.isCreditSale === false
    ) {
      return true;
    }
    return false;
  }

  getTransactionType(): TransactionType {
    return TransactionType.SALE;
  }

  protected async doPost(data: TransactionData): Promise<PostingResult> {
    const saleData = data as SaleTransactionData;

    if (saleData.isCreditSale) {
      return await this.postCreditSale(saleData as CreditSaleTransactionData);
    } else {
      return await this.postCashSale(saleData as CashSaleTransactionData);
    }
  }

  /**
   * Post a credit sale (order fulfilled without payment)
   */
  private async postCreditSale(data: CreditSaleTransactionData): Promise<PostingResult> {
    const order = data.order;

    if (!order.customer) {
      throw new Error('Order must have customer for credit sale');
    }

    // Use totalWithTax to get the full tax-inclusive amount when prices include tax
    const orderAmount = order.totalWithTax || order.total;

    if (orderAmount <= 0) {
      throw new Error(
        `Order ${order.id} has non-positive total (${orderAmount}) and cannot be posted as a credit sale`
      );
    }

    const context: SalePostingContext = {
      amount: orderAmount,
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer.id.toString(),
      isCreditSale: true,
    };

    await this.postingService.postCreditSale(data.ctx, order.id.toString(), context);

    this.logger.log(`Posted credit sale for order ${order.code} to ledger`);

    return {
      success: true,
    };
  }

  /**
   * Post a cash sale (payment settlement)
   */
  private async postCashSale(data: CashSaleTransactionData): Promise<PostingResult> {
    const payment = data.payment;
    const order = data.order;
    const debitAccountCode = (payment.metadata?.debitAccountCode as string)?.trim();
    if (debitAccountCode) {
      await this.chartOfAccountsService.validatePaymentSourceAccount(data.ctx, debitAccountCode);
    }

    if (payment.amount <= 0) {
      throw new Error(
        `Payment ${payment.id} has non-positive amount (${payment.amount}) and cannot be posted to ledger`
      );
    }

    // Only post if payment is settled
    if (payment.state !== 'Settled') {
      this.logger.warn(
        `Payment ${payment.id} is not settled (state: ${payment.state}), skipping ledger posting for order ${order.code}`
      );
      return {
        success: false,
        error: `Payment ${payment.id} is not settled`,
      };
    }

    const resolvedAccountCode = (payment.metadata?.debitAccountCode as string)?.trim() || undefined;
    const context: PaymentPostingContext = {
      amount: payment.amount,
      method: payment.method,
      orderId: order.id.toString(),
      orderCode: order.code,
      customerId: order.customer?.id?.toString(),
      resolvedAccountCode,
    };

    await this.postingService.postPayment(data.ctx, payment.id.toString(), context);

    this.logger.log(`Posted cash sale (payment ${payment.id}) for order ${order.code} to ledger`);

    return {
      success: true,
    };
  }

  protected getAffectedAccountCodes(data: TransactionData): string[] {
    const saleData = data as SaleTransactionData;
    const accounts: string[] = [ACCOUNT_CODES.SALES];

    if (saleData.isCreditSale) {
      accounts.push(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    } else {
      const cashSaleData = saleData as CashSaleTransactionData;
      const clearingAccount =
        (cashSaleData.payment.metadata?.debitAccountCode as string)?.trim() ||
        mapPaymentMethodToAccount(cashSaleData.payment.method);
      accounts.push(clearingAccount);
    }

    return accounts;
  }
}
