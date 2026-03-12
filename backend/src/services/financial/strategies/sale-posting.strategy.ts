import { Injectable } from '@nestjs/common';
import {
  EventBus,
  Order,
  OrderService,
  Payment,
  RequestContext,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import { ProductStockChangedEvent } from '../../../infrastructure/events/custom-events';
import { ACCOUNT_CODES } from '../../../ledger/account-codes.constants';
import { BaseTransactionStrategy } from '../base-transaction-strategy';
import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { LedgerPostingService } from '../ledger-posting.service';
import { LedgerQueryService } from '../ledger-query.service';
import { InventoryService, RecordSaleInput } from '../../inventory/inventory.service';
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
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly inventoryService: InventoryService,
    private readonly stockLocationService: StockLocationService,
    private readonly orderService: OrderService,
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus
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

    await this.recordSaleCogsIfNeeded(data.ctx, order);

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
      openSessionId: (data as Record<string, unknown>).openSessionId as string | undefined,
    };

    await this.postingService.postPayment(data.ctx, payment.id.toString(), context);

    this.logger.log(`Posted cash sale (payment ${payment.id}) for order ${order.code} to ledger`);

    await this.recordSaleCogsIfNeeded(data.ctx, order);

    return {
      success: true,
    };
  }

  /**
   * Record COGS for the order (FIFO allocation, ledger COGS post) once per order.
   * Idempotent: skips if COGS already posted for this order.
   */
  private async recordSaleCogsIfNeeded(ctx: RequestContext, order: Order): Promise<void> {
    try {
      const channelId = ctx.channelId as number;
      const orderId = order.id.toString();

      const alreadyPosted = await this.queryService.hasInventorySaleCogsForOrder(
        channelId,
        orderId
      );
      if (alreadyPosted) {
        return;
      }

      // Always reload with lines — callers do not guarantee this relation is hydrated
      const fullOrder = await this.orderService.findOne(ctx, order.id, [
        'lines',
        'lines.productVariant',
        'customer',
      ]);
      if (!fullOrder) {
        this.logger.warn(`Order ${orderId} not found when recording COGS — skipping`);
        return;
      }

      const location = await this.stockLocationService.defaultStockLocation(ctx);
      if (!location?.id) {
        this.logger.warn(
          `No stock location for channel ${channelId}; skipping COGS recording for order ${fullOrder.code}`
        );
        return;
      }

      const lines = (fullOrder.lines ?? [])
        .filter(line => line.quantity > 0)
        .map(line => ({
          productVariantId: String(line.productVariantId ?? (line as any).productVariant?.id),
          quantity: line.quantity,
        }));

      if (lines.length === 0) {
        return;
      }

      const saleDate =
        fullOrder.orderPlacedAt != null
          ? new Date(fullOrder.orderPlacedAt).toISOString().slice(0, 10)
          : undefined;

      const input: RecordSaleInput = {
        orderId,
        orderCode: fullOrder.code,
        channelId: ctx.channelId as any,
        stockLocationId: location.id as any,
        customerId: fullOrder.customer?.id?.toString() ?? '',
        saleDate,
        lines,
      };

      await this.inventoryService.recordSale(ctx, input);
      await this.setCogsStatus(ctx, order.id, 'recorded');
      this.logger.log(`Recorded COGS for order ${fullOrder.code}`);

      // Notify frontends so product cache updates stock
      const productIds = [
        ...new Set(
          (fullOrder.lines ?? [])
            .map(line => (line as any).productVariant?.productId?.toString())
            .filter(Boolean) as string[]
        ),
      ];
      if (productIds.length > 0) {
        this.eventBus.publish(new ProductStockChangedEvent(ctx, String(channelId), productIds));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isInsufficientStock =
        message.includes('Insufficient stock') ||
        message.includes('Insufficient quantity in batch') ||
        (message.includes('Batch') && message.includes('not found or not available'));
      if (isInsufficientStock) {
        // Batch stock exhausted at sale time (e.g. oversold). Mark the order so operators can
        // query all skipped-COGS orders and reconcile after restocking.
        await this.setCogsStatus(ctx, order.id, 'skipped').catch(() => {});
        this.logger.warn(
          `Skipping COGS for order ${order.code}: no batch stock (${message}). ` +
            `Add stock via stock adjustment so future sales can record COGS.`
        );
        return;
      }
      this.logger.error(`Failed to record COGS for order ${order.code}: ${message}`);
      throw err;
    }
  }

  private async setCogsStatus(
    ctx: RequestContext,
    orderId: string | number,
    status: 'recorded' | 'skipped'
  ): Promise<void> {
    try {
      const orderRepo = this.connection.getRepository(ctx, Order);
      const existing = await orderRepo.findOne({ where: { id: orderId } });
      if (!existing) return;
      const customFields = (existing.customFields as Record<string, unknown>) || {};
      await orderRepo.update(
        { id: orderId },
        { customFields: { ...customFields, cogsStatus: status } as Record<string, unknown> }
      );
    } catch (e) {
      this.logger.warn(
        `Failed to set cogsStatus="${status}" on order ${orderId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
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
