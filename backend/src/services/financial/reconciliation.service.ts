import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { ReconciliationAccount } from '../../domain/recon/reconciliation-account.entity';
import { Reconciliation, ReconciliationScope } from '../../domain/recon/reconciliation.entity';
import { Account } from '../../ledger/account.entity';
import { AccountBalanceService } from './account-balance.service';
import { FinancialService } from './financial.service';
import {
  ReconciliationStatus,
  ScopeReconciliationStatus,
  toScopeRefId,
} from './period-management.types';

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
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly accountBalanceService: AccountBalanceService,
    private readonly financialService: FinancialService
  ) {}

  /**
   * Create reconciliation record.
   * For scope=manual: forces range to today, runs in one transaction, and posts variance to the ledger per account.
   */
  async createReconciliation(
    ctx: RequestContext,
    input: CreateReconciliationInput
  ): Promise<Reconciliation> {
    if (input.scope === 'manual') {
      return this.createManualReconciliationWithPosting(ctx, input);
    }
    return this.createReconciliationRecordOnly(ctx, input);
  }

  /**
   * Manual reconciliation: snapshot as of today, post variance so ledger matches declared.
   */
  private async createManualReconciliationWithPosting(
    ctx: RequestContext,
    input: CreateReconciliationInput
  ): Promise<Reconciliation> {
    const today = new Date().toISOString().slice(0, 10);
    return this.connection.withTransaction(ctx, async txCtx => {
      const accountRepo = this.connection.getRepository(txCtx, Account);
      const declared = input.accountDeclaredAmounts ?? {};
      const accountIds = input.accountIds ?? [];

      if (accountIds.length === 0) {
        return this.createReconciliationRecordOnly(txCtx, {
          ...input,
          rangeStart: today,
          rangeEnd: today,
          actualBalance: '0',
        });
      }

      const accounts = await accountRepo.find({
        where: { id: In(accountIds) },
        select: ['id', 'code'],
      });
      const accountById = new Map(accounts.map(a => [a.id, a]));

      let expectedSum = 0;
      let actualSum = 0;
      const perAccount: Array<{
        accountId: string;
        code: string;
        expectedCents: number;
        declaredCents: number;
        varianceCents: number;
      }> = [];

      for (const accountId of accountIds) {
        const account = accountById.get(accountId);
        if (!account) continue;
        const balance = await this.accountBalanceService.getAccountBalance(
          txCtx,
          account.code,
          input.channelId,
          today
        );
        const expectedCents = balance.balance;
        const declaredCents = parseInt(declared[accountId] ?? '0', 10) || 0;
        const varianceCents = declaredCents - expectedCents;
        expectedSum += expectedCents;
        actualSum += declaredCents;
        perAccount.push({
          accountId,
          code: account.code,
          expectedCents,
          declaredCents,
          varianceCents,
        });
      }

      const reconciliationRepo = this.connection.getRepository(txCtx, Reconciliation);
      const createdBy = txCtx.activeUserId ? parseInt(txCtx.activeUserId.toString(), 10) : 0;
      const varianceAmount = (expectedSum - actualSum).toString();

      const reconciliation = reconciliationRepo.create({
        channelId: input.channelId,
        scope: 'manual',
        scopeRefId: input.scopeRefId,
        rangeStart: today,
        rangeEnd: today,
        status: 'draft',
        expectedBalance: String(expectedSum),
        actualBalance: String(actualSum),
        varianceAmount,
        notes: input.notes || null,
        createdBy,
      });
      const saved = await reconciliationRepo.save(reconciliation);

      const junctionRepo = this.connection.getRepository(txCtx, ReconciliationAccount);
      const rows = accountIds.map(id =>
        junctionRepo.create({
          reconciliationId: saved.id,
          accountId: id,
          declaredAmountCents: declared[id] ?? null,
        })
      );
      await junctionRepo.save(rows);

      for (const { code, varianceCents } of perAccount) {
        if (varianceCents !== 0) {
          await this.financialService.postVarianceAdjustment(
            txCtx,
            'manual',
            code,
            varianceCents,
            'Manual reconciliation',
            saved.id
          );
        }
      }

      return saved;
    });
  }

  /**
   * Create reconciliation record only (no ledger posting). Used for non-manual scopes.
   */
  private async createReconciliationRecordOnly(
    ctx: RequestContext,
    input: CreateReconciliationInput
  ): Promise<Reconciliation> {
    this.logger.log(`createReconciliation input.accountIds=${JSON.stringify(input?.accountIds)}`);
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);
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
   * Get ledger balance (in cents) for each of the given account codes as of a date.
   * Used by shift modal prefill (clearing accounts).
   */
  async getAccountBalancesForCodes(
    ctx: RequestContext,
    channelId: number,
    accountCodes: string[],
    asOfDate?: string
  ): Promise<Array<{ accountCode: string; accountName: string; balanceCents: string }>> {
    if (accountCodes.length === 0) return [];

    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId, code: In(accountCodes), isActive: true },
    });

    const result: Array<{ accountCode: string; accountName: string; balanceCents: string }> = [];
    for (const account of accounts) {
      try {
        const balance = await this.accountBalanceService.getAccountBalance(
          ctx,
          account.code,
          channelId,
          asOfDate
        );
        result.push({
          accountCode: account.code,
          accountName: account.name,
          balanceCents: String(balance.balance),
        });
      } catch {
        result.push({
          accountCode: account.code,
          accountName: account.name,
          balanceCents: '0',
        });
      }
    }
    return result;
  }

  /**
   * Get ledger balance (in cents) for each leaf account as of a date. Used by manual reconciliation UI.
   */
  async getAccountBalancesAsOf(
    ctx: RequestContext,
    channelId: number,
    asOfDate: string
  ): Promise<
    Array<{ accountId: string; accountCode: string; accountName: string; balanceCents: string }>
  > {
    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId, isActive: true, isParent: false },
      order: { code: 'ASC' },
    });
    const result: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      balanceCents: string;
    }> = [];
    for (const account of accounts) {
      try {
        const balance = await this.accountBalanceService.getAccountBalance(
          ctx,
          account.code,
          channelId,
          asOfDate
        );
        result.push({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          balanceCents: String(balance.balance),
        });
      } catch {
        result.push({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          balanceCents: '0',
        });
      }
    }
    return result;
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
   * Get per-account details for a reconciliation (accounts reconciled and variance per account).
   * Executed lazily when the user expands a row. Returns empty array if no reconciliation_account rows.
   */
  async getReconciliationDetails(
    ctx: RequestContext,
    reconciliationId: string
  ): Promise<
    Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      declaredAmountCents: string | null;
      expectedBalanceCents: string | null;
      varianceCents: string | null;
    }>
  > {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);
    const reconciliation = await reconciliationRepo.findOne({
      where: { id: reconciliationId },
    });
    if (!reconciliation) {
      return [];
    }

    const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
    const rows = await junctionRepo.find({
      where: { reconciliationId },
      relations: ['account'],
    });
    this.logger.log(
      `getReconciliationDetails reconciliationId=${reconciliationId} junctionRows=${rows.length}`
    );

    const result: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      declaredAmountCents: string | null;
      expectedBalanceCents: string | null;
      varianceCents: string | null;
    }> = [];

    for (const row of rows) {
      const account = row.account;
      if (!account) continue;
      const declaredStr = row.declaredAmountCents ?? null;
      let expectedStr: string | null = null;
      let varianceStr: string | null = null;
      try {
        const balance = await this.accountBalanceService.getAccountBalance(
          ctx,
          account.code,
          reconciliation.channelId,
          reconciliation.rangeEnd
        );
        expectedStr = String(balance.balance);
        const expected = BigInt(expectedStr);
        const declared = declaredStr !== null ? BigInt(declaredStr) : BigInt(0);
        varianceStr = (expected - declared).toString();
      } catch {
        // Account may be deleted or balance unavailable
      }
      result.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        declaredAmountCents: declaredStr,
        expectedBalanceCents: expectedStr,
        varianceCents: varianceStr,
      });
    }

    return result;
  }

  /** Session id must be a UUID; reject placeholders like "-1" so invalid ids are never used. */
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Get per-account reconciliation details for a cashier session.
   * @param kind - 'opening' = reconciliation at session open (first by rangeStart); 'closing' = at close (first by rangeEnd DESC). Default 'closing'.
   * Returns [] if no matching reconciliation exists or if sessionId is not a valid UUID.
   */
  async getSessionReconciliationDetails(
    ctx: RequestContext,
    sessionId: string,
    kind: 'opening' | 'closing' = 'closing'
  ): Promise<
    Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      declaredAmountCents: string | null;
      expectedBalanceCents: string | null;
      varianceCents: string | null;
    }>
  > {
    const trimmed = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!trimmed || trimmed === '-1' || !ReconciliationService.UUID_REGEX.test(trimmed)) {
      this.logger.warn(
        `getSessionReconciliationDetails: invalid sessionId (rejected), kind=${kind}`
      );
      return [];
    }
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);

    // Primary: kind-specific scopeRefId (new format: sessionId:opening or sessionId:closing)
    const kindRef = toScopeRefId({ scope: 'cash-session', sessionId: trimmed, kind });
    let list = await reconciliationRepo
      .createQueryBuilder('r')
      .where('r.scope = :scope', { scope: 'cash-session' })
      .andWhere('r.scopeRefId = :scopeRefId', { scopeRefId: kindRef })
      .take(1)
      .getMany();

    // Fallback: legacy bare sessionId (for records created before kind suffix was added)
    if (list.length === 0) {
      const legacyRef = toScopeRefId({ scope: 'cash-session', sessionId: trimmed });
      const legacyQb = reconciliationRepo
        .createQueryBuilder('r')
        .where('r.scope = :scope', { scope: 'cash-session' })
        .andWhere('r.scopeRefId = :scopeRefId', { scopeRefId: legacyRef });
      if (kind === 'opening') {
        legacyQb.orderBy('r.rangeStart', 'ASC').addOrderBy('r.rangeEnd', 'ASC');
      } else {
        legacyQb.orderBy('r.rangeEnd', 'DESC').addOrderBy('r.rangeStart', 'DESC');
      }
      list = await legacyQb.take(1).getMany();
    }

    const reconciliation = list[0];
    this.logger.log(
      `getSessionReconciliationDetails sessionId=${sessionId} kind=${kind} found=${!!reconciliation} reconciliationId=${reconciliation?.id ?? 'n/a'}`
    );
    if (!reconciliation) return [];
    return this.getReconciliationDetails(ctx, reconciliation.id);
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
