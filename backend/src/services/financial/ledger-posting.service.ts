import { Injectable, Logger, Optional } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { MetricsService } from '../../infrastructure/observability/metrics.service';
import { TracingService } from '../../infrastructure/observability/tracing.service';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { Account } from '../../ledger/account.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { PostingPayload, PostingService } from '../../ledger/posting.service';
import {
  InventoryPurchasePostingContext,
  InventorySalePostingContext,
  InventoryWriteOffPostingContext,
  PaymentPostingContext,
  PurchasePostingContext,
  RefundPostingContext,
  SalePostingContext,
  SupplierPaymentPostingContext,
  createCreditSaleEntry,
  createInventoryPurchaseEntry,
  createInventorySaleCogsEntry,
  createInventoryWriteOffEntry,
  createPaymentAllocationEntry,
  createPaymentEntry,
  createRefundEntry,
  createSupplierPaymentEntry,
  createSupplierPurchaseEntry,
} from './posting-policy';

@Injectable()
export class LedgerPostingService {
  private readonly logger = new Logger(LedgerPostingService.name);

  constructor(
    private readonly postingService: PostingService,
    private readonly connection: TransactionalConnection,
    @Optional() private readonly tracingService?: TracingService,
    @Optional() private readonly metricsService?: MetricsService
  ) {}

  /**
   * Ensure required accounts exist for a channel
   * Throws if any account is missing
   */
  async ensureAccountsExist(ctx: RequestContext, accountCodes: string[]): Promise<void> {
    const accounts = await this.connection
      .getRepository(ctx, Account)
      .createQueryBuilder('a')
      .where('a.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('a.code IN (:...codes)', { codes: accountCodes })
      .getMany();

    const found = new Set(accounts.map(a => a.code));
    const missing = accountCodes.filter(code => !found.has(code));

    if (missing.length > 0) {
      throw new Error(
        `Missing required accounts for channel ${ctx.channelId}: ${missing.join(', ')}. ` +
          `Please initialize Chart of Accounts for this channel.`
      );
    }
  }

  /**
   * Post a payment entry (customer payment settlement)
   */
  async postPayment(
    ctx: RequestContext,
    sourceId: string,
    context: PaymentPostingContext
  ): Promise<void> {
    const span = this.tracingService?.startSpan('ledger.postPayment', {
      'ledger.type': 'Payment',
      'ledger.source_id': sourceId,
      'ledger.channel_id': ctx.channelId?.toString() || '',
      'ledger.order_code': context.orderCode,
    });

    try {
      const template = createPaymentEntry(context);
      const accountCodes = template.lines.map(l => l.accountCode);

      await this.ensureAccountsExist(ctx, accountCodes);

      const payload: PostingPayload = {
        channelId: ctx.channelId as number,
        entryDate: new Date().toISOString().slice(0, 10),
        memo: template.memo,
        lines: template.lines,
      };

      await this.postingService.post(ctx, 'Payment', sourceId, payload);

      this.metricsService?.recordLedgerPosting('Payment', ctx.channelId?.toString() || '');
      this.tracingService?.addEvent(span!, 'ledger.posted', {
        'ledger.source_id': sourceId,
      });

      this.logger.log(`Posted payment entry for payment ${sourceId}, order ${context.orderCode}`);
      this.tracingService?.endSpan(span!, true);
    } catch (error) {
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Post a credit sale entry (order fulfilled without payment)
   */
  async postCreditSale(
    ctx: RequestContext,
    sourceId: string,
    context: SalePostingContext
  ): Promise<void> {
    const template = createCreditSaleEntry(context);
    const accountCodes = template.lines.map(l => l.accountCode);

    await this.ensureAccountsExist(ctx, accountCodes);

    const payload: PostingPayload = {
      channelId: ctx.channelId as number,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: template.memo,
      lines: template.lines,
    };

    await this.postingService.post(ctx, 'CreditSale', sourceId, payload);
    this.logger.log(`Posted credit sale entry for order ${context.orderCode}`);
  }

  /**
   * Post a payment allocation entry (customer paying off credit)
   */
  async postPaymentAllocation(
    ctx: RequestContext,
    sourceId: string,
    context: PaymentPostingContext
  ): Promise<void> {
    const template = createPaymentAllocationEntry(context);
    const accountCodes = template.lines.map(l => l.accountCode);

    await this.ensureAccountsExist(ctx, accountCodes);

    const payload: PostingPayload = {
      channelId: ctx.channelId as number,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: template.memo,
      lines: template.lines,
    };

    // Post allocation and enforce AR invariant inside the same transaction.
    await this.postingService.post(ctx, 'PaymentAllocation', sourceId, payload);
    await this.assertAccountsReceivableInvariant(ctx, context.orderId);
    this.logger.log(
      `Posted payment allocation entry for payment ${sourceId}, order ${context.orderCode}`
    );
  }

  /**
   * Post a supplier purchase entry (credit purchase)
   */
  async postSupplierPurchase(
    ctx: RequestContext,
    sourceId: string,
    context: PurchasePostingContext
  ): Promise<void> {
    const template = createSupplierPurchaseEntry(context);
    const accountCodes = template.lines.map(l => l.accountCode);

    await this.ensureAccountsExist(ctx, accountCodes);

    const payload: PostingPayload = {
      channelId: ctx.channelId as number,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: template.memo,
      lines: template.lines,
    };

    await this.postingService.post(ctx, 'SupplierPurchase', sourceId, payload);
    this.logger.log(`Posted supplier purchase entry for purchase ${context.purchaseReference}`);
  }

  /**
   * Post a supplier payment entry
   */
  async postSupplierPayment(
    ctx: RequestContext,
    sourceId: string,
    context: SupplierPaymentPostingContext
  ): Promise<void> {
    const template = createSupplierPaymentEntry(context);
    const accountCodes = template.lines.map(l => l.accountCode);

    await this.ensureAccountsExist(ctx, accountCodes);

    const payload: PostingPayload = {
      channelId: ctx.channelId as number,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: template.memo,
      lines: template.lines,
    };

    // Post payment and enforce AP invariant inside the same transaction.
    await this.postingService.post(ctx, 'SupplierPayment', sourceId, payload);
    await this.assertAccountsPayableInvariant(ctx, context.supplierId);
    this.logger.log(
      `Posted supplier payment entry for payment ${sourceId}, purchase ${context.purchaseReference}`
    );
  }

  /**
   * Post a refund entry
   */
  async postRefund(
    ctx: RequestContext,
    sourceId: string,
    context: RefundPostingContext
  ): Promise<void> {
    const template = createRefundEntry(context);
    const accountCodes = template.lines.map(l => l.accountCode);

    await this.ensureAccountsExist(ctx, accountCodes);

    const payload: PostingPayload = {
      channelId: ctx.channelId as number,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: template.memo,
      lines: template.lines,
    };

    await this.postingService.post(ctx, 'Refund', sourceId, payload);
    this.logger.log(`Posted refund entry for refund ${sourceId}, order ${context.orderCode}`);
  }

  /**
   * Post an inventory purchase entry
   */
  async postInventoryPurchase(
    ctx: RequestContext,
    sourceId: string,
    context: InventoryPurchasePostingContext
  ): Promise<void> {
    const span = this.tracingService?.startSpan('ledger.postInventoryPurchase', {
      'ledger.type': 'InventoryPurchase',
      'ledger.source_id': sourceId,
      'ledger.channel_id': ctx.channelId?.toString() || '',
      'ledger.purchase_id': context.purchaseId,
    });

    try {
      const template = createInventoryPurchaseEntry(context);
      const accountCodes = template.lines.map(l => l.accountCode);

      await this.ensureAccountsExist(ctx, accountCodes);

      const payload: PostingPayload = {
        channelId: ctx.channelId as number,
        entryDate: new Date().toISOString().slice(0, 10),
        memo: template.memo,
        lines: template.lines,
      };

      await this.postingService.post(ctx, 'InventoryPurchase', sourceId, payload);

      this.metricsService?.recordLedgerPosting(
        'InventoryPurchase',
        ctx.channelId?.toString() || ''
      );
      this.tracingService?.addEvent(span!, 'ledger.posted', {
        'ledger.source_id': sourceId,
      });

      this.logger.log(
        `Posted inventory purchase entry for purchase ${context.purchaseReference}, total cost: ${context.totalCost}`
      );
      this.tracingService?.endSpan(span!, true);
    } catch (error) {
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Post an inventory sale COGS entry
   */
  async postInventorySaleCogs(
    ctx: RequestContext,
    sourceId: string,
    context: InventorySalePostingContext
  ): Promise<void> {
    const span = this.tracingService?.startSpan('ledger.postInventorySaleCogs', {
      'ledger.type': 'InventorySaleCogs',
      'ledger.source_id': sourceId,
      'ledger.channel_id': ctx.channelId?.toString() || '',
      'ledger.order_code': context.orderCode,
    });

    try {
      const template = createInventorySaleCogsEntry(context);
      const accountCodes = template.lines.map(l => l.accountCode);

      await this.ensureAccountsExist(ctx, accountCodes);

      const payload: PostingPayload = {
        channelId: ctx.channelId as number,
        entryDate: new Date().toISOString().slice(0, 10),
        memo: template.memo,
        lines: template.lines,
      };

      await this.postingService.post(ctx, 'InventorySaleCogs', sourceId, payload);

      this.metricsService?.recordLedgerPosting(
        'InventorySaleCogs',
        ctx.channelId?.toString() || ''
      );
      this.tracingService?.addEvent(span!, 'ledger.posted', {
        'ledger.source_id': sourceId,
      });

      this.logger.log(
        `Posted inventory sale COGS entry for order ${context.orderCode}, total COGS: ${context.totalCogs}`
      );
      this.tracingService?.endSpan(span!, true);
    } catch (error) {
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Post an inventory write-off entry
   */
  async postInventoryWriteOff(
    ctx: RequestContext,
    sourceId: string,
    context: InventoryWriteOffPostingContext
  ): Promise<void> {
    const span = this.tracingService?.startSpan('ledger.postInventoryWriteOff', {
      'ledger.type': 'InventoryWriteOff',
      'ledger.source_id': sourceId,
      'ledger.channel_id': ctx.channelId?.toString() || '',
      'ledger.adjustment_id': context.adjustmentId,
    });

    try {
      const template = createInventoryWriteOffEntry(context);
      const accountCodes = template.lines.map(l => l.accountCode);

      await this.ensureAccountsExist(ctx, accountCodes);

      const payload: PostingPayload = {
        channelId: ctx.channelId as number,
        entryDate: new Date().toISOString().slice(0, 10),
        memo: template.memo,
        lines: template.lines,
      };

      await this.postingService.post(ctx, 'InventoryWriteOff', sourceId, payload);

      this.metricsService?.recordLedgerPosting(
        'InventoryWriteOff',
        ctx.channelId?.toString() || ''
      );
      this.tracingService?.addEvent(span!, 'ledger.posted', {
        'ledger.source_id': sourceId,
      });

      this.logger.log(
        `Posted inventory write-off entry for adjustment ${context.adjustmentId}, total loss: ${context.totalLoss}, reason: ${context.reason}`
      );
      this.tracingService?.endSpan(span!, true);
    } catch (error) {
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Post a variance adjustment (short/over) so the ledger balances.
   * Shortage: debit CASH_SHORT_OVER, credit account (e.g. CASH_ON_HAND).
   * Overage: debit account, credit CASH_SHORT_OVER.
   */
  async postVarianceAdjustment(
    ctx: RequestContext,
    channelId: number,
    sessionId: string,
    accountCode: string,
    varianceCents: number,
    reason: string,
    sourceId: string
  ): Promise<void> {
    if (varianceCents === 0) return;

    const absAmount = Math.abs(varianceCents);
    const meta = { openSessionId: sessionId, varianceReason: reason };

    const lines: Array<{
      accountCode: string;
      debit?: number;
      credit?: number;
      meta?: Record<string, unknown>;
    }> =
      varianceCents < 0
        ? [
            { accountCode: ACCOUNT_CODES.CASH_SHORT_OVER, debit: absAmount, meta },
            { accountCode, credit: absAmount, meta },
          ]
        : [
            { accountCode, debit: absAmount, meta },
            { accountCode: ACCOUNT_CODES.CASH_SHORT_OVER, credit: absAmount, meta },
          ];

    await this.ensureAccountsExist(ctx, [accountCode, ACCOUNT_CODES.CASH_SHORT_OVER]);

    const payload: PostingPayload = {
      channelId,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Variance adjustment: ${reason}`,
      lines,
    };

    await this.postingService.post(ctx, 'variance-adjustment', sourceId, payload);
    this.logger.log(
      `Posted variance adjustment for session ${sessionId}, account ${accountCode}, amount ${varianceCents}`
    );
  }

  /**
   * Assert that, for a given order, AR credits do not exceed AR debits.
   * Runs inside the same transaction as the posting to guarantee consistency.
   */
  private async assertAccountsReceivableInvariant(
    ctx: RequestContext,
    orderId: string
  ): Promise<void> {
    const accountRepo = this.connection.getRepository(ctx, Account);
    const arAccount = await accountRepo.findOne({
      where: {
        channelId: ctx.channelId as number,
        code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      },
    });

    if (!arAccount) {
      // Misconfiguration rather than a runtime invariant violation.
      throw new Error(
        `Accounts Receivable account not found for channel ${ctx.channelId}. ` +
          `Please initialize Chart of Accounts.`
      );
    }

    const lineRepo = this.connection.getRepository(ctx, JournalLine);
    const result = await lineRepo
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .where('line.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('line.accountId = :accountId', { accountId: arAccount.id })
      .andWhere("line.meta->>'orderId' = :orderId", { orderId })
      .select('SUM(CAST(line.debit AS BIGINT))', 'debitTotal')
      .addSelect('SUM(CAST(line.credit AS BIGINT))', 'creditTotal')
      .getRawOne();

    const debitTotal = parseInt(result?.debitTotal || '0', 10);
    const creditTotal = parseInt(result?.creditTotal || '0', 10);

    if (debitTotal === 0) {
      throw new Error(
        `Cannot allocate payment for order ${orderId} because no Accounts Receivable debits exist ` +
          `for this order in the ledger`
      );
    }

    if (creditTotal > debitTotal) {
      const overpay = creditTotal - debitTotal;
      throw new Error(
        `Payment allocation would overpay Accounts Receivable by ${overpay} cents for order ${orderId} ` +
          `(debited=${debitTotal}, credited=${creditTotal})`
      );
    }
  }

  /**
   * Assert that, for a given supplier, AP debits do not exceed AP credits.
   * Runs inside the same transaction as the posting to guarantee consistency.
   */
  private async assertAccountsPayableInvariant(
    ctx: RequestContext,
    supplierId: string
  ): Promise<void> {
    const accountRepo = this.connection.getRepository(ctx, Account);
    const apAccount = await accountRepo.findOne({
      where: {
        channelId: ctx.channelId as number,
        code: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      },
    });

    if (!apAccount) {
      throw new Error(
        `Accounts Payable account not found for channel ${ctx.channelId}. ` +
          `Please initialize Chart of Accounts.`
      );
    }

    const lineRepo = this.connection.getRepository(ctx, JournalLine);
    const result = await lineRepo
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .where('line.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('line.accountId = :accountId', { accountId: apAccount.id })
      .andWhere("line.meta->>'supplierId' = :supplierId", { supplierId })
      .select('SUM(CAST(line.debit AS BIGINT))', 'debitTotal')
      .addSelect('SUM(CAST(line.credit AS BIGINT))', 'creditTotal')
      .getRawOne();

    const debitTotal = parseInt(result?.debitTotal || '0', 10);
    const creditTotal = parseInt(result?.creditTotal || '0', 10);
    const outstandingInCents = creditTotal - debitTotal; // positive when we owe supplier

    if (outstandingInCents < 0) {
      throw new Error(
        `Accounts Payable invariant violated for supplier ${supplierId}: ` +
          `debits (${debitTotal}) exceed credits (${creditTotal}).`
      );
    }
  }
}
