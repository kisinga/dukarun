/**
 * Unified Credit Service.
 *
 * Handles credit approval, limits, and repayment tracking for both
 * customers and suppliers via CreditPartyType field mapping.
 *
 * Outstanding balances are derived from the ledger (single source of truth).
 * Frozen = credit disabled AND outstanding ≠ 0 (inferred, not stored).
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  Customer,
  ID,
  Order,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';
import { AR_OWING_ORDER_STATES } from '../../constants/order-states.constants';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChannelCommunicationService } from '../channels/channel-communication.service';
import { FinancialService } from '../financial/financial.service';
import { LedgerQueryService } from '../financial/ledger-query.service';
import { StockPurchase } from '../stock/entities/purchase.entity';
import { PurchasePayment } from '../stock/entities/purchase-payment.entity';
import {
  CreditFieldMap,
  CreditPartyType,
  CreditSummary,
  CREDIT_FIELD_MAPS,
} from './credit-party.types';

export interface CustomerSupplierDivergenceItem {
  entityId: string;
  partyType: CreditPartyType;
  modelBalance: number;
  ledgerBalance: number;
  signedLedgerBalance: number;
  residual: number;
}

export interface CustomerSupplierDivergenceResult {
  items: CustomerSupplierDivergenceItem[];
  totalItems: number;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger('CreditService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly financialService: FinancialService,
    @Optional() private readonly ledgerQueryService?: LedgerQueryService,
    @Optional() private readonly communicationService?: ChannelCommunicationService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  async getCreditSummary(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType
  ): Promise<CreditSummary> {
    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
    return this.mapToSummary(customer, outstandingAmount, partyType);
  }

  async approveCredit(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    approved: boolean,
    creditLimit?: number,
    creditDuration?: number
  ): Promise<CreditSummary> {
    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const fields = CREDIT_FIELD_MAPS[partyType];
    const customFields = customer.customFields as any;

    customer.customFields = {
      ...customFields,
      [fields.isApproved]: approved,
      [fields.creditLimit]: creditLimit ?? customFields?.[fields.creditLimit] ?? 0,
      [fields.creditDuration]: creditDuration ?? customFields?.[fields.creditDuration] ?? 30,
      [fields.approvedByUserId]: ctx.activeUserId,
    } as any;

    await this.connection.getRepository(ctx, Customer).save(customer);
    this.logger.log(
      `Updated ${partyType} credit approval for ${entityId}: approved=${approved} ` +
        `limit=${(customer.customFields as any)[fields.creditLimit]} ` +
        `duration=${(customer.customFields as any)[fields.creditDuration]}`
    );

    if (this.auditService) {
      await this.auditService.log(ctx, `${partyType}.credit.approved`, {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: {
          approved,
          creditLimit: (customer.customFields as any)[fields.creditLimit],
          creditDuration: (customer.customFields as any)[fields.creditDuration],
        },
      });
    }

    const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
    return this.mapToSummary(customer, outstandingAmount, partyType);
  }

  async updateCreditLimit(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    creditLimit: number,
    creditDuration?: number
  ): Promise<CreditSummary> {
    if (creditLimit < 0) {
      throw new UserInputError('Credit limit must be zero or positive.');
    }
    if (creditDuration !== undefined && creditDuration < 1) {
      throw new UserInputError('Credit duration must be at least 1 day.');
    }

    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const fields = CREDIT_FIELD_MAPS[partyType];
    const customFields = customer.customFields as any;

    customer.customFields = {
      ...customFields,
      [fields.creditLimit]: creditLimit,
      ...(creditDuration !== undefined && { [fields.creditDuration]: creditDuration }),
    } as any;

    await this.connection.getRepository(ctx, Customer).save(customer);
    this.logger.log(
      `Updated ${partyType} credit limit for ${entityId} to ${creditLimit}` +
        (creditDuration !== undefined ? `, duration: ${creditDuration}` : '')
    );

    if (this.auditService) {
      await this.auditService.log(ctx, `${partyType}.credit.limit_changed`, {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: { creditLimit, creditDuration },
      });
    }

    const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
    return this.mapToSummary(customer, outstandingAmount, partyType);
  }

  async updateCreditDuration(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    creditDuration: number
  ): Promise<CreditSummary> {
    if (creditDuration < 1) {
      throw new UserInputError('Credit duration must be at least 1 day.');
    }

    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const fields = CREDIT_FIELD_MAPS[partyType];
    const customFields = customer.customFields as any;

    customer.customFields = {
      ...customFields,
      [fields.creditDuration]: creditDuration,
    } as any;

    await this.connection.getRepository(ctx, Customer).save(customer);
    this.logger.log(
      `Updated ${partyType} credit duration for ${entityId} to ${creditDuration} days`
    );

    if (this.auditService) {
      await this.auditService.log(ctx, `${partyType}.credit.duration_changed`, {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: { creditDuration },
      });
    }

    const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
    return this.mapToSummary(customer, outstandingAmount, partyType);
  }

  /**
   * Record repayment tracking (last date + amount).
   * Called after a payment is allocated to orders/purchases.
   */
  async recordRepayment(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    amount: number
  ): Promise<void> {
    if (amount <= 0) {
      return;
    }

    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const fields = CREDIT_FIELD_MAPS[partyType];
    const customFields = customer.customFields as any;
    const now = new Date();

    customer.customFields = {
      ...customFields,
      [fields.lastRepaymentDate]: now,
      [fields.lastRepaymentAmount]: amount,
    } as any;

    await this.connection.getRepository(ctx, Customer).save(customer);
    this.logger.log(
      `Recorded ${partyType} repayment for ${entityId}. Amount: ${amount}, Date: ${now}`
    );

    if (this.communicationService) {
      const currentOutstanding = await this.getBalance(ctx, entityId, partyType);
      await this.communicationService
        .sendBalanceChangeNotification(
          ctx,
          String(entityId),
          currentOutstanding + amount,
          currentOutstanding
        )
        .catch(error => {
          this.logger.warn(
            `Failed to send balance change notification: ${error instanceof Error ? error.message : String(error)}`
          );
        });
    }
  }

  /**
   * Rebuild the ledger balance from the independent order/purchase model.
   *
   * This computes what the entity should owe from its open orders (customer) or
   * purchases (supplier), then posts a ledger adjustment so the ledger matches that
   * model state. It trusts the model and mutates the ledger — the opposite of
   * rebuilding model state from the ledger. Use only as a human-approved healing
   * action for drift.
   */
  async rebuildLedgerFromModel(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    note?: string
  ): Promise<{ previousBalance: number; newBalance: number; adjustmentAmount: number }> {
    const ledgerBalance = await this.getBalance(ctx, entityId, partyType);
    const modelBalance =
      partyType === 'supplier'
        ? await this.getSupplierModelBalance(ctx, entityId)
        : await this.getCustomerModelBalance(ctx, entityId);

    const reason = note?.trim()
      ? `Rebuild ledger from ${partyType} model: ${note.trim()}`
      : `Rebuild ledger from ${partyType} model`;

    this.logger.log(
      `Rebuilding ledger for ${partyType} ${entityId} from model: ledger=${ledgerBalance}, model=${modelBalance}`
    );

    return this.overrideBalance(ctx, entityId, partyType, modelBalance, reason);
  }

  /**
   * Override a customer/supplier balance by posting a BalanceAdjustment ledger entry.
   * The ledger remains the single source of truth.
   */
  async overrideBalance(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    targetBalance: number,
    reason: string
  ): Promise<{ previousBalance: number; newBalance: number; adjustmentAmount: number }> {
    if (!reason?.trim()) {
      throw new UserInputError('A reason is required for balance override.');
    }

    // Verify entity exists
    await this.getEntityOrThrow(ctx, entityId, partyType);

    const result =
      partyType === 'supplier'
        ? await this.financialService.adjustSupplierBalance(
            ctx,
            entityId.toString(),
            targetBalance,
            reason.trim()
          )
        : await this.financialService.adjustCustomerBalance(
            ctx,
            entityId.toString(),
            targetBalance,
            reason.trim()
          );

    if (this.auditService) {
      await this.auditService.log(ctx, `${partyType}.balance.override`, {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: {
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
          adjustmentAmount: result.adjustmentAmount,
          reason: reason.trim(),
          performedBy: ctx.activeUserId,
        },
      });
    }

    this.logger.log(
      `Balance override for ${partyType} ${entityId}: ${result.previousBalance} → ${result.newBalance} (reason: ${reason})`
    );

    return result;
  }

  // ── Public balance / freeze helpers ──────────────────────────────

  /**
   * Get the ledger balance for a customer or supplier.
   */
  async getBalance(ctx: RequestContext, entityId: ID, partyType: CreditPartyType): Promise<number> {
    return partyType === 'supplier'
      ? this.financialService.getSupplierBalance(ctx, entityId.toString())
      : this.financialService.getCustomerBalance(ctx, entityId.toString());
  }

  /**
   * Freeze credit for an entity by disabling credit approval.
   * Payments can still be recorded; new credit transactions are blocked.
   */
  async freezeCustomerCredit(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType,
    reason: string
  ): Promise<CreditSummary> {
    const customer = await this.getEntityOrThrow(ctx, entityId, partyType);
    const fields = CREDIT_FIELD_MAPS[partyType];
    const customFields = customer.customFields as any;

    if (customFields?.[fields.isApproved] === false) {
      // Already frozen; just return summary.
      const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
      return this.mapToSummary(customer, outstandingAmount, partyType);
    }

    customer.customFields = {
      ...customFields,
      [fields.isApproved]: false,
    } as any;

    await this.connection.getRepository(ctx, Customer).save(customer);
    this.logger.log(`Frozen ${partyType} credit for ${entityId}. Reason: ${reason}`);

    if (this.auditService) {
      await this.auditService.log(ctx, `${partyType}.credit.frozen`, {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: { reason },
      });
    }

    const outstandingAmount = await this.getBalance(ctx, entityId, partyType);
    return this.mapToSummary(customer, outstandingAmount, partyType);
  }

  // ── Customer / supplier residual divergence ──────────────────────

  /**
   * Scan customers or suppliers for residual divergence between their model-derived
   * balance (sum of orders/purchases) and the ledger balance.
   *
   * Residual divergence means the aggregate ledger balance does not match the sum of
   * the underlying orders/purchases. Fix order/purchase-level drift first; this
   * surface only catches aggregate-level drift from untracked payments, credits,
   * channel leaks, or failed reversals.
   */
  async findCustomerSupplierDivergences(
    ctx: RequestContext,
    partyType: CreditPartyType,
    toleranceCents = 0
  ): Promise<CustomerSupplierDivergenceResult> {
    const entityIds =
      partyType === 'supplier'
        ? await this.findSupplierIdsInChannel(ctx)
        : await this.findCustomerIdsInChannel(ctx);

    const items: CustomerSupplierDivergenceItem[] = [];
    for (const entityId of entityIds) {
      const modelBalance =
        partyType === 'supplier'
          ? await this.getSupplierModelBalance(ctx, entityId)
          : await this.getCustomerModelBalance(ctx, entityId);

      const signedLedgerBalance =
        partyType === 'supplier'
          ? await this.getSignedSupplierBalance(ctx, entityId)
          : await this.getSignedCustomerBalance(ctx, entityId);

      // For suppliers: modelBalance - (-signedLedgerBalance) = modelBalance + signedLedgerBalance
      // For customers: modelBalance - signedLedgerBalance
      const residual =
        partyType === 'supplier'
          ? modelBalance + signedLedgerBalance
          : modelBalance - signedLedgerBalance;

      if (Math.abs(residual) > toleranceCents) {
        items.push({
          entityId: entityId.toString(),
          partyType,
          modelBalance,
          ledgerBalance: Math.max(
            0,
            partyType === 'supplier' ? -signedLedgerBalance : signedLedgerBalance
          ),
          signedLedgerBalance,
          residual,
        });
      }
    }

    return { items, totalItems: items.length };
  }

  /**
   * Trust the order/purchase model: post a ledger adjustment so the customer's AR
   * balance matches the model-derived balance.
   *
   * Use only after order-level drift has been repaired. The scanner shows whether a
   * residual is a ledger credit (negative residual) or missing debt (positive residual).
   */
  async adjustCustomerBalanceToModel(
    ctx: RequestContext,
    entityId: ID,
    note?: string
  ): Promise<{ previousBalance: number; newBalance: number; adjustmentAmount: number }> {
    await this.getEntityOrThrow(ctx, entityId, 'customer');
    const modelBalance = await this.getCustomerModelBalance(ctx, entityId);
    const signedLedgerBalance = await this.getSignedCustomerBalance(ctx, entityId);
    const residual = modelBalance - signedLedgerBalance;

    if (residual === 0) {
      return {
        previousBalance: Math.max(0, signedLedgerBalance),
        newBalance: modelBalance,
        adjustmentAmount: 0,
      };
    }

    const reason = note?.trim()
      ? `Customer residual reconciliation: ${note.trim()}`
      : 'Customer residual reconciliation: trust model';

    const result = await this.financialService.adjustCustomerBalance(
      ctx,
      entityId.toString(),
      modelBalance,
      reason
    );

    if (this.auditService) {
      await this.auditService.log(ctx, 'customer.balance.residual_adjustment', {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: {
          modelBalance,
          previousSignedBalance: signedLedgerBalance,
          residual,
          reason,
          performedBy: ctx.activeUserId,
        },
      });
    }

    return result;
  }

  /**
   * Trust the purchase model: post a ledger adjustment so the supplier's AP
   * balance matches the model-derived balance.
   */
  async adjustSupplierBalanceToModel(
    ctx: RequestContext,
    entityId: ID,
    note?: string
  ): Promise<{ previousBalance: number; newBalance: number; adjustmentAmount: number }> {
    await this.getEntityOrThrow(ctx, entityId, 'supplier');
    const modelBalance = await this.getSupplierModelBalance(ctx, entityId);
    const signedLedgerBalance = await this.getSignedSupplierBalance(ctx, entityId);
    const residual = modelBalance + signedLedgerBalance;

    if (residual === 0) {
      return {
        previousBalance: Math.max(0, -signedLedgerBalance),
        newBalance: modelBalance,
        adjustmentAmount: 0,
      };
    }

    const reason = note?.trim()
      ? `Supplier residual reconciliation: ${note.trim()}`
      : 'Supplier residual reconciliation: trust model';

    const result = await this.financialService.adjustSupplierBalance(
      ctx,
      entityId.toString(),
      modelBalance,
      reason
    );

    if (this.auditService) {
      await this.auditService.log(ctx, 'supplier.balance.residual_adjustment', {
        entityType: 'Customer',
        entityId: entityId.toString(),
        data: {
          modelBalance,
          previousSignedBalance: signedLedgerBalance,
          residual,
          reason,
          performedBy: ctx.activeUserId,
        },
      });
    }

    return result;
  }

  private async getSignedCustomerBalance(ctx: RequestContext, customerId: ID): Promise<number> {
    if (!this.ledgerQueryService) {
      throw new Error('LedgerQueryService is required for signed balance lookups');
    }
    const balance = await this.ledgerQueryService.getAccountBalance({
      channelId: ctx.channelId as number,
      accountCode: 'ACCOUNTS_RECEIVABLE',
      customerId: customerId.toString(),
    });
    return balance.balance;
  }

  private async getSignedSupplierBalance(ctx: RequestContext, supplierId: ID): Promise<number> {
    if (!this.ledgerQueryService) {
      throw new Error('LedgerQueryService is required for signed balance lookups');
    }
    const balance = await this.ledgerQueryService.getAccountBalance({
      channelId: ctx.channelId as number,
      accountCode: 'ACCOUNTS_PAYABLE',
      supplierId: supplierId.toString(),
    });
    return balance.balance;
  }

  private async findCustomerIdsInChannel(ctx: RequestContext): Promise<ID[]> {
    const orderRepo = this.connection.getRepository(ctx, Order);
    const rows = (await orderRepo
      .createQueryBuilder('order')
      .select('DISTINCT order.customerId', 'customerId')
      .where('order.channelId = :channelId', { channelId: ctx.channelId as number })
      .getRawMany()) as Array<{ customerId: string | number }>;
    return rows.map(r => Number(r.customerId));
  }

  private async findSupplierIdsInChannel(ctx: RequestContext): Promise<ID[]> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const rows = (await purchaseRepo
      .createQueryBuilder('purchase')
      .select('DISTINCT purchase.supplierId', 'supplierId')
      .where('purchase.channelId = :channelId', { channelId: ctx.channelId as number })
      .andWhere('purchase.isCreditPurchase = :isCreditPurchase', { isCreditPurchase: true })
      .getRawMany()) as Array<{ supplierId: string | number }>;
    return rows.map(r => Number(r.supplierId));
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async getEntityOrThrow(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType
  ): Promise<Customer> {
    const customer = await this.connection.getRepository(ctx, Customer).findOne({
      where: { id: entityId },
    });

    if (!customer) {
      const label = partyType === 'supplier' ? 'Supplier' : 'Customer';
      throw new UserInputError(`${label} ${entityId} not found`);
    }

    if (partyType === 'supplier') {
      const customFields = customer.customFields as any;
      if (!customFields?.isSupplier) {
        throw new UserInputError(`Customer ${entityId} is not marked as a supplier.`);
      }
    }

    return customer;
  }

  /**
   * Compute the customer's model-derived balance from its orders.
   * Includes any order that can carry AR and subtracts settled payments.
   */
  private async getCustomerModelBalance(ctx: RequestContext, customerId: ID): Promise<number> {
    const orderRepo = this.connection.getRepository(ctx, Order);
    const orders = await orderRepo.find({
      where: {
        customer: { id: customerId },
        channelId: ctx.channelId as number,
        state: In(AR_OWING_ORDER_STATES),
      } as any,
      relations: ['payments'],
    });

    return orders.reduce((sum, order) => {
      const totalOwed = order.totalWithTax || order.total || 0;
      const settledPayments = (order.payments || [])
        .filter(p => p.state === 'Settled')
        .reduce((paid, p) => paid + Number(p.amount), 0);
      return sum + Math.max(0, totalOwed - settledPayments);
    }, 0);
  }

  /**
   * Compute the supplier's model-derived balance from its credit purchases.
   * Includes all credit purchases and subtracts recorded PurchasePayments.
   * Ignores paymentStatus because that field itself can drift from the ledger.
   */
  private async getSupplierModelBalance(ctx: RequestContext, supplierId: ID): Promise<number> {
    const purchaseRepo = this.connection.getRepository(ctx, StockPurchase);
    const purchases = await purchaseRepo.find({
      where: {
        supplierId: Number(supplierId),
        channelId: ctx.channelId as number,
        isCreditPurchase: true,
      },
      relations: ['payments'],
    });

    return purchases.reduce((sum, purchase) => {
      const totalOwed = purchase.totalCost || 0;
      const paid = (purchase.payments || []).reduce((p, payment) => p + Number(payment.amount), 0);
      return sum + Math.max(0, totalOwed - paid);
    }, 0);
  }

  private mapToSummary(
    customer: Customer,
    outstandingAmount: number,
    partyType: CreditPartyType
  ): CreditSummary {
    const fields = CREDIT_FIELD_MAPS[partyType];
    const cf = customer.customFields as any;
    const isCreditApproved = Boolean(cf?.[fields.isApproved]);
    const creditLimit = Number(cf?.[fields.creditLimit] ?? 0);
    const creditDuration = Number(cf?.[fields.creditDuration] ?? 30);
    const creditFrozen = !isCreditApproved && outstandingAmount !== 0;
    const availableCredit = Math.max(creditLimit - Math.abs(outstandingAmount), 0);

    return {
      entityId: customer.id,
      partyType,
      isCreditApproved,
      creditFrozen,
      creditLimit,
      outstandingAmount,
      availableCredit,
      lastRepaymentDate: cf?.[fields.lastRepaymentDate]
        ? new Date(cf[fields.lastRepaymentDate])
        : null,
      lastRepaymentAmount: Number(cf?.[fields.lastRepaymentAmount] ?? 0),
      creditDuration,
    };
  }
}
