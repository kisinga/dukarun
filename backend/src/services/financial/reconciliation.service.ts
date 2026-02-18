import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { ReconciliationAccount } from '../../domain/recon/reconciliation-account.entity';
import { Reconciliation, ReconciliationScope } from '../../domain/recon/reconciliation.entity';
import { Account } from '../../ledger/account.entity';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { AccountBalanceService } from './account-balance.service';
import { ChannelPaymentMethodService } from './channel-payment-method.service';
import { FinancialService } from './financial.service';
import {
  fromScopeRefId,
  ReconciliationStatus,
  ScopeReconciliationStatus,
  toScopeRefId,
} from './period-management.types';
import {
  getAccountCodeFromPaymentMethod,
  isCashierControlledPaymentMethod,
} from './payment-method-mapping.config';

/** Per-account declared amount by account code (API boundary). */
export interface DeclaredAmountInput {
  accountCode: string;
  amountCents: string;
}

export interface CreateReconciliationInput {
  channelId: number;
  scope: ReconciliationScope;
  scopeRefId: string;
  expectedBalance?: string; // in smallest currency unit
  actualBalance: string; // in smallest currency unit
  notes?: string;
  /** Declared amounts by account code; resolved server-side to IDs with channel ownership validation */
  declaredAmounts: DeclaredAmountInput[];
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
    private readonly channelPaymentMethodService: ChannelPaymentMethodService,
    private readonly financialService: FinancialService
  ) {}

  /**
   * Resolve declaredAmounts (by account code) to accountIds and accountDeclaredAmounts (by ID).
   * Validates channel ownership: all codes must exist for the given channelId.
   */
  private async resolveDeclaredAmounts(
    ctx: RequestContext,
    channelId: number,
    declaredAmounts: Array<{ accountCode: string; amountCents: string }>
  ): Promise<{ accountIds: string[]; accountDeclaredAmounts: Record<string, string> }> {
    if (declaredAmounts.length === 0) {
      return { accountIds: [], accountDeclaredAmounts: {} };
    }
    const codes = [...new Set(declaredAmounts.map(d => d.accountCode))];
    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId, code: In(codes) },
      select: ['id', 'code'],
    });
    const byCode = new Map(accounts.map(a => [a.code, a.id]));
    const missing = codes.filter(c => !byCode.has(c));
    if (missing.length > 0) {
      throw new Error(`Accounts not found for channel ${channelId}: ${missing.join(', ')}`);
    }
    const accountIds: string[] = [];
    const accountDeclaredAmounts: Record<string, string> = {};
    for (const d of declaredAmounts) {
      const id = byCode.get(d.accountCode)!;
      accountDeclaredAmounts[id] = d.amountCents;
      if (!accountIds.includes(id)) accountIds.push(id);
    }
    return { accountIds, accountDeclaredAmounts };
  }

  /**
   * Create reconciliation record.
   * Reconciliation is a snapshot in time; the service derives the snapshot date internally.
   * For scope=manual: snapshot = today. For scope=cash-session: pass snapshotDate in options.
   */
  async createReconciliation(
    ctx: RequestContext,
    input: CreateReconciliationInput,
    options?: { snapshotDate?: string }
  ): Promise<Reconciliation> {
    if (input.scope === 'manual') {
      return this.createManualReconciliationWithPosting(ctx, input);
    }
    const snapshotDate = options?.snapshotDate ?? new Date().toISOString().slice(0, 10);
    return this.createReconciliationRecordOnly(ctx, input, snapshotDate);
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
      const { accountIds, accountDeclaredAmounts } = await this.resolveDeclaredAmounts(
        txCtx,
        input.channelId,
        input.declaredAmounts
      );
      const declared = accountDeclaredAmounts;

      if (accountIds.length === 0) {
        return this.createReconciliationRecordOnly(
          txCtx,
          {
            ...input,
            actualBalance: '0',
          },
          today
        );
      }

      const accountRepo = this.connection.getRepository(txCtx, Account);
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
        snapshotAt: today,
        status: 'verified',
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
    input: CreateReconciliationInput,
    snapshotDate: string
  ): Promise<Reconciliation> {
    const { accountIds, accountDeclaredAmounts } = await this.resolveDeclaredAmounts(
      ctx,
      input.channelId,
      input.declaredAmounts
    );

    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);
    const expectedBalance = input.expectedBalance ? BigInt(input.expectedBalance) : BigInt(0);
    const actualBalance = BigInt(input.actualBalance);
    const varianceAmount = (expectedBalance - actualBalance).toString();
    const createdBy = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;
    const reconciliation = reconciliationRepo.create({
      channelId: input.channelId,
      scope: input.scope,
      scopeRefId: input.scopeRefId,
      snapshotAt: snapshotDate,
      status: 'verified',
      expectedBalance: input.expectedBalance || null,
      actualBalance: input.actualBalance,
      varianceAmount,
      notes: input.notes || null,
      createdBy,
    });
    const saved = await reconciliationRepo.save(reconciliation);

    if (accountIds.length > 0) {
      const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
      const declared = accountDeclaredAmounts;
      const rows = accountIds.map(accountId =>
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

    // Find reconciliations whose snapshot is at this period end date
    const reconciliations = await reconciliationRepo
      .createQueryBuilder('reconciliation')
      .where('reconciliation.channelId = :channelId', { channelId })
      .andWhere('reconciliation.snapshotAt = :periodEndDate', { periodEndDate })
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
      .orderBy('r.snapshotAt', 'DESC')
      .addOrderBy('r.id', 'DESC');

    if (options?.startDate) {
      qb.andWhere('r.snapshotAt >= :startDate', { startDate: options.startDate });
    }
    if (options?.endDate) {
      qb.andWhere('r.snapshotAt <= :endDate', { endDate: options.endDate });
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
   * Derive per-account details for a cash-session reconciliation when junction rows are empty.
   * Uses channel payment method config to determine accounts; splits actualBalance to first account.
   */
  private async deriveCashSessionDetails(
    ctx: RequestContext,
    reconciliation: Reconciliation
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
    const paymentMethods = await this.channelPaymentMethodService.getChannelPaymentMethods(
      ctx,
      reconciliation.channelId
    );
    const cashierControlled = paymentMethods.filter(
      pm => pm.enabled && isCashierControlledPaymentMethod(pm)
    );
    let codes = [...new Set(cashierControlled.map(pm => getAccountCodeFromPaymentMethod(pm)))];
    if (codes.length === 0) {
      const accountRepo = this.connection.getRepository(ctx, Account);
      const fallback = await accountRepo.findOne({
        where: { channelId: reconciliation.channelId, code: ACCOUNT_CODES.CASH_ON_HAND },
      });
      if (!fallback) return [];
      codes = [ACCOUNT_CODES.CASH_ON_HAND];
    }

    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId: reconciliation.channelId, code: In(codes) },
    });
    const actualTotal = BigInt(reconciliation.actualBalance ?? '0');
    const result: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      declaredAmountCents: string | null;
      expectedBalanceCents: string | null;
      varianceCents: string | null;
    }> = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const declaredStr = i === 0 ? actualTotal.toString() : '0';
      let expectedStr: string | null = null;
      let varianceStr: string | null = null;
      try {
        const balance = await this.accountBalanceService.getAccountBalance(
          ctx,
          account.code,
          reconciliation.channelId,
          reconciliation.snapshotAt
        );
        expectedStr = String(balance.balance);
        const expected = BigInt(expectedStr);
        const declared = BigInt(declaredStr);
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
    if (!reconciliationId || reconciliationId === '-1') {
      return [];
    }
    const trimmedId = String(reconciliationId).trim();
    if (!trimmedId || trimmedId === '-1') return [];

    this.logger.log(`getReconciliationDetails requested reconciliationId=${trimmedId}`);

    let reconciliation: Reconciliation | null = null;
    try {
      const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);
      reconciliation = await reconciliationRepo.findOne({
        where: { id: trimmedId },
      });
      if (!reconciliation) {
        this.logger.warn(`getReconciliationDetails reconciliation not found: ${trimmedId}`);
        return [];
      }

      const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
      let rows: Array<ReconciliationAccount & { account?: Account | null }>;
      try {
        rows = await junctionRepo.find({
          where: { reconciliationId: trimmedId },
          relations: ['account'],
        });
      } catch (e) {
        this.logger.warn(`getReconciliationDetails junction find failed: ${trimmedId}`, e);
        rows = [];
      }
      this.logger.log(
        `getReconciliationDetails reconciliationId=${trimmedId} junctionRows=${rows.length}`
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
            reconciliation.snapshotAt
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

      // When no junction rows: for cash-session scope, derive per-account details from channel config.
      if (result.length === 0 && reconciliation.scope === 'cash-session') {
        const derived = await this.deriveCashSessionDetails(ctx, reconciliation);
        if (derived.length > 0) {
          this.logger.log(
            `getReconciliationDetails derived ${derived.length} rows from session config reconciliationId=${trimmedId}`
          );
          return derived;
        }
      }

      // Fallback: when no per-account junction rows (legacy, inventory, or empty manual),
      // return a summary row so the user sees expected/actual/variance.
      if (result.length === 0) {
        this.logger.log(`getReconciliationDetails fallback summary reconciliationId=${trimmedId}`);
        const expected = reconciliation.expectedBalance ?? null;
        const actual = reconciliation.actualBalance ?? null;
        const variance = reconciliation.varianceAmount ?? null;
        result.push({
          accountId: trimmedId,
          accountCode: '–',
          accountName: 'Summary (no per-account breakdown)',
          declaredAmountCents: actual,
          expectedBalanceCents: expected,
          varianceCents: variance,
        });
      }

      return result;
    } catch (e) {
      this.logger.warn(`getReconciliationDetails error: ${trimmedId}`, e);
      if (reconciliation) {
        return [
          {
            accountId: trimmedId,
            accountCode: '–',
            accountName: 'Summary (no per-account breakdown)',
            declaredAmountCents: reconciliation.actualBalance ?? null,
            expectedBalanceCents: reconciliation.expectedBalance ?? null,
            varianceCents: reconciliation.varianceAmount ?? null,
          },
        ];
      }
      return [];
    }
  }

  /** Session id must be a UUID; reject placeholders like "-1" so invalid ids are never used. */
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Get per-account reconciliation details for a cashier session.
   * @param kind - 'opening' = reconciliation at session open (first by snapshotAt ASC); 'closing' = at close (first by snapshotAt DESC). Default 'closing'.
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
        legacyQb.orderBy('r.snapshotAt', 'ASC');
      } else {
        legacyQb.orderBy('r.snapshotAt', 'DESC');
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
