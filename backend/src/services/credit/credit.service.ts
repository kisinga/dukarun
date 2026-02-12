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
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { ChannelCommunicationService } from '../channels/channel-communication.service';
import { FinancialService } from '../financial/financial.service';
import {
  CreditFieldMap,
  CreditPartyType,
  CreditSummary,
  CREDIT_FIELD_MAPS,
} from './credit-party.types';

@Injectable()
export class CreditService {
  private readonly logger = new Logger('CreditService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly financialService: FinancialService,
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

  private async getBalance(
    ctx: RequestContext,
    entityId: ID,
    partyType: CreditPartyType
  ): Promise<number> {
    return partyType === 'supplier'
      ? this.financialService.getSupplierBalance(ctx, entityId.toString())
      : this.financialService.getCustomerBalance(ctx, entityId.toString());
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
