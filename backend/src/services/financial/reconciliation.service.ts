import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Reconciliation, ReconciliationScope } from '../../domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../domain/recon/reconciliation-account.entity';
import { AccountBalanceService } from './account-balance.service';
import { ReconciliationStatus, ScopeReconciliationStatus } from './period-management.types';

export interface CreateReconciliationInput {
  channelId: number;
  scope: ReconciliationScope;
  scopeRefId: string;
  rangeStart: string;
  rangeEnd: string;
  expectedBalance?: string; // in smallest currency unit
  actualBalance: string; // in smallest currency unit
  notes?: string;
  /** Account IDs (UUID) this reconciliation covers; rows inserted into reconciliation_account */
  accountIds?: string[];
  /** Per-account declared amounts (accountId -> declaredAmountCents string) for opening/closing */
  accountDeclaredAmounts?: Record<string, string>;
}

/**
 * Reconciliation Service
 *
 * IMPORTANT: The ledger is the SINGLE SOURCE OF TRUTH for all account balances.
 * This service uses AccountBalanceService which queries journal lines directly from the ledger.
 *
 * Manages reconciliation records for all scopes.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly accountBalanceService: AccountBalanceService
  ) {}

  /**
   * Create reconciliation record
   */
  async createReconciliation(
    ctx: RequestContext,
    input: CreateReconciliationInput
  ): Promise<Reconciliation> {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);

    // Calculate variance
    const expectedBalance = input.expectedBalance ? BigInt(input.expectedBalance) : BigInt(0);
    const actualBalance = BigInt(input.actualBalance);
    const varianceAmount = (expectedBalance - actualBalance).toString();

    const createdBy = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;

    const reconciliation = reconciliationRepo.create({
      channelId: input.channelId,
      scope: input.scope,
      scopeRefId: input.scopeRefId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      status: 'draft',
      expectedBalance: input.expectedBalance || null,
      actualBalance: input.actualBalance,
      varianceAmount,
      notes: input.notes || null,
      createdBy,
    });

    const saved = await reconciliationRepo.save(reconciliation);

    if (input.accountIds?.length) {
      const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
      const declared = input.accountDeclaredAmounts ?? {};
      const rows = input.accountIds.map(accountId =>
        junctionRepo.create({
          reconciliationId: saved.id,
          accountId,
          declaredAmountCents: declared[accountId] ?? null,
        })
      );
      await junctionRepo.save(rows);
    }

    return saved;
  }

  /**
   * Verify reconciliation (draft → verified)
   */
  async verifyReconciliation(
    ctx: RequestContext,
    reconciliationId: string
  ): Promise<Reconciliation> {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);

    const reconciliation = await reconciliationRepo.findOne({
      where: { id: reconciliationId },
    });

    if (!reconciliation) {
      throw new Error(`Reconciliation ${reconciliationId} not found`);
    }

    if (reconciliation.status === 'verified') {
      return reconciliation; // Already verified
    }

    reconciliation.status = 'verified';
    reconciliation.reviewedBy = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : null;

    return reconciliationRepo.save(reconciliation);
  }

  /**
   * Get reconciliation status for a period
   */
  async getReconciliationStatus(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string
  ): Promise<ReconciliationStatus> {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);

    // Find all reconciliations that cover this period end date
    const reconciliations = await reconciliationRepo
      .createQueryBuilder('reconciliation')
      .where('reconciliation.channelId = :channelId', { channelId })
      .andWhere('reconciliation.rangeStart <= :periodEndDate', { periodEndDate })
      .andWhere('reconciliation.rangeEnd >= :periodEndDate', { periodEndDate })
      .getMany();

    // Build scope status list
    const scopes: ScopeReconciliationStatus[] = reconciliations.map(rec => ({
      scope: rec.scope,
      scopeRefId: rec.scopeRefId,
      status: rec.status,
      varianceAmount: rec.varianceAmount,
    }));

    return {
      periodEndDate,
      scopes,
    };
  }

  /**
   * List reconciliations for a channel with optional filters (for history UI).
   */
  async getReconciliations(
    ctx: RequestContext,
    channelId: number,
    options?: {
      startDate?: string;
      endDate?: string;
      scope?: string;
      hasVariance?: boolean;
      take?: number;
      skip?: number;
    }
  ): Promise<{ items: Reconciliation[]; totalItems: number }> {
    const qb = this.connection
      .getRepository(ctx, Reconciliation)
      .createQueryBuilder('r')
      .where('r.channelId = :channelId', { channelId })
      .orderBy('r.rangeEnd', 'DESC')
      .addOrderBy('r.rangeStart', 'DESC');

    if (options?.startDate) {
      qb.andWhere('r.rangeEnd >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      qb.andWhere('r.rangeStart <= :endDate', { endDate: options.endDate });
    }
    if (options?.scope) {
      qb.andWhere('r.scope = :scope', { scope: options.scope });
    }
    if (options?.hasVariance === true) {
      qb.andWhere('r.varianceAmount != :zero', { zero: '0' });
    }

    const totalItems = await qb.getCount();

    if (options?.take != null) {
      qb.take(options.take);
    }
    if (options?.skip != null) {
      qb.skip(options.skip);
    }

    const items = await qb.getMany();
    return { items, totalItems };
  }

  /**
   * Calculate account balance for a period
   */
  async calculateAccountBalanceForPeriod(
    ctx: RequestContext,
    accountCode: string,
    channelId: number,
    startDate: string,
    endDate: string
  ): Promise<any> {
    return this.accountBalanceService.getAccountBalance(ctx, accountCode, channelId, endDate);
  }
}
