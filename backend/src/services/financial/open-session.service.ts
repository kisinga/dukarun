import { Injectable, Logger } from '@nestjs/common';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { CashDrawerCount, CashCountType } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { Account } from '../../ledger/account.entity';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../domain/recon/reconciliation-account.entity';
import { LedgerQueryService } from './ledger-query.service';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import {
  getAccountCodeFromPaymentMethod,
  getReconciliationTypeFromPaymentMethod,
  isCashierControlledPaymentMethod,
  requiresReconciliation,
} from './payment-method-mapping.config';
import { FinancialService } from './financial.service';
import { CreateReconciliationInput, ReconciliationService } from './reconciliation.service';
import {
  PaymentMethodReconciliationConfig,
  SessionReconciliationRequirements,
  toScopeRefId,
} from './period-management.types';
import { ChannelPaymentMethodService } from './channel-payment-method.service';

/**
 * Cashier Session Summary
 * Financial summary for a cashier session from ledger
 */
export interface CashierSessionSummary {
  sessionId: string;
  cashierUserId: number;
  openedAt: Date;
  closedAt?: Date | null;
  status: 'open' | 'closed';
  openingFloat: number;
  closingDeclared: number;
  ledgerTotals: {
    cashTotal: number;
    mpesaTotal: number;
    totalCollected: number;
  };
  variance: number; // closingDeclared - (openingFloat + ledgerTotals.cashTotal)
}

/**
 * Close Session Input (per-account closing, like opening).
 */
export interface CloseSessionInput {
  sessionId: string;
  closingBalances: Array<{ accountCode: string; amountCents: number }>;
  notes?: string;
}

/**
 * Per-account opening balance (cashier-controlled account).
 */
export interface OpeningBalanceInput {
  accountCode: string;
  amountCents: number;
}

/**
 * Open Session Input (per-account opening; no single float).
 */
export interface OpenSessionInput {
  channelId: number;
  openingBalances: OpeningBalanceInput[];
}

/**
 * Record Cash Count Input (Blind Count)
 */
export interface RecordCashCountInput {
  sessionId: string;
  declaredCash: number; // Amount cashier counted (in cents)
  countType: CashCountType;
  /** Reason for variance (stored on count and in ledger line meta for audit) */
  varianceReason?: string;
  /** When true, record the count for audit but skip automatic variance posting (caller handles it). */
  skipVariancePosting?: boolean;
}

/**
 * Cash Count Result
 * Returned to cashier after blind count - variance details hidden
 */
export interface CashCountResult {
  count: CashDrawerCount;
  hasVariance: boolean; // Tells cashier there's a difference without revealing amount
  varianceHidden: boolean; // True if cashier can't see the variance
}

/**
 * Verify M-Pesa Input
 */
export interface VerifyMpesaInput {
  sessionId: string;
  allConfirmed: boolean;
  flaggedTransactionIds?: string[];
  notes?: string;
}

/**
 * Cashier Session Service
 *
 * Manages cashier sessions and provides ledger-integrated reconciliation.
 * Composes existing infrastructure (LedgerQueryService, ReconciliationService)
 * to enable session-scoped financial tracking.
 *
 * IMPORTANT: All financial figures come from the ledger as the single source of truth.
 */
@Injectable()
export class OpenSessionService {
  private readonly logger = new Logger(OpenSessionService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly ledgerQueryService: LedgerQueryService,
    private readonly reconciliationService: ReconciliationService,
    private readonly financialService: FinancialService,
    private readonly channelPaymentMethodService: ChannelPaymentMethodService
  ) {}

  /**
   * Start a new cashier session with per-account opening reconciliation.
   * Opening is stored as one reconciliation + reconciliation_account rows with declaredAmountCents.
   */
  async startSession(ctx: RequestContext, input: OpenSessionInput): Promise<CashierSession> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const existingOpenSession = await sessionRepo.findOne({
      where: { channelId: input.channelId, status: 'open' },
    });
    if (existingOpenSession) {
      throw new Error(
        `Channel ${input.channelId} already has an open cashier session. ` +
          `Please close session ${existingOpenSession.id} before opening a new one.`
      );
    }

    const requirements = await this.getChannelReconciliationRequirements(ctx, input.channelId);
    const requiredCodes = new Set(requirements.paymentMethods.map(pm => pm.ledgerAccountCode));
    const givenCodes = new Set(input.openingBalances.map(b => b.accountCode));
    const missing = [...requiredCodes].filter(c => !givenCodes.has(c));
    if (missing.length > 0) {
      throw new Error(
        `Opening must include every cashier-controlled account. Missing: ${missing.join(', ')}`
      );
    }

    const cashierUserId = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;
    const session = sessionRepo.create({
      channelId: input.channelId,
      cashierUserId,
      openedAt: new Date(),
      closingDeclared: '0',
      status: 'open',
    });
    const savedSession = await sessionRepo.save(session);
    if (!OpenSessionService.isValidSessionId(savedSession.id)) {
      this.logger.error(
        `startSession: saved session has invalid id (channelId=${input.channelId}, id=${savedSession.id}); this should never happen with uuid column`
      );
      throw new Error('Session was created with an invalid id; please contact support.');
    }

    const today = savedSession.openedAt.toISOString().slice(0, 10);
    const byCode = await this.getAccountIdsByCode(ctx, input.channelId, [...requiredCodes]);
    const accountDeclaredAmounts: Record<string, string> = {};
    let totalDeclared = 0;
    for (const { accountCode, amountCents } of input.openingBalances) {
      const accountId = byCode[accountCode];
      if (accountId) {
        accountDeclaredAmounts[accountId] = String(amountCents);
        totalDeclared += amountCents;
      }
    }
    const accountIds = Object.keys(accountDeclaredAmounts);

    const openingRecon = await this.reconciliationService.createReconciliation(ctx, {
      channelId: input.channelId,
      scope: 'cash-session',
      scopeRefId: toScopeRefId({
        scope: 'cash-session',
        sessionId: savedSession.id,
        kind: 'opening',
      }),
      rangeStart: today,
      rangeEnd: today,
      expectedBalance: '0',
      actualBalance: String(totalDeclared),
      notes: `Opening reconciliation for session ${savedSession.id}`,
      accountIds,
      accountDeclaredAmounts,
    });

    for (const { accountCode, amountCents } of input.openingBalances) {
      if (amountCents !== 0) {
        await this.financialService.postVarianceAdjustment(
          ctx,
          savedSession.id,
          accountCode,
          amountCents,
          'Opening balance',
          openingRecon.id
        );
      }
    }

    this.logger.log(
      `Cashier session ${savedSession.id} started for channel ${input.channelId} by user ${cashierUserId} (per-account opening)`
    );
    return savedSession;
  }

  /**
   * Resolve account codes to account IDs for the channel.
   */
  private async getAccountIdsByCode(
    ctx: RequestContext,
    channelId: number,
    codes: string[]
  ): Promise<Record<string, string>> {
    if (codes.length === 0) return {};
    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId, code: In(codes) },
      select: ['id', 'code'],
    });
    return Object.fromEntries(accounts.map(a => [a.code, a.id]));
  }

  /**
   * Derive session opening total from the opening reconciliation (sum of declaredAmountCents).
   */
  async getOpeningBalanceForSession(ctx: RequestContext, sessionId: string): Promise<number> {
    const reconRepo = this.connection.getRepository(ctx, Reconciliation);
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      select: ['id', 'openedAt'],
    });
    if (!session) return 0;

    // Try kind-specific scopeRefId first, then fall back to legacy bare sessionId
    let openingRecon = await reconRepo.findOne({
      where: {
        scope: 'cash-session',
        scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId, kind: 'opening' }),
      },
    });
    if (!openingRecon) {
      const legacyRecons = await reconRepo.find({
        where: {
          scope: 'cash-session',
          scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId }),
        },
        order: { rangeStart: 'ASC' },
        take: 1,
      });
      openingRecon = legacyRecons[0] ?? null;
    }
    if (!openingRecon) return 0;

    const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
    const rows = await junctionRepo.find({
      where: { reconciliationId: openingRecon.id },
      select: ['declaredAmountCents'],
    });
    return rows.reduce(
      (sum, r) => sum + (r.declaredAmountCents ? parseInt(r.declaredAmountCents, 10) : 0),
      0
    );
  }

  /**
   * Get the opening declared amount for a specific account code in a session.
   * Reads from the opening reconciliation's ReconciliationAccount junction rows.
   */
  private async getOpeningBalanceForAccount(
    ctx: RequestContext,
    sessionId: string,
    accountCode: string
  ): Promise<number> {
    const reconRepo = this.connection.getRepository(ctx, Reconciliation);

    // Try kind-specific scopeRefId first, then legacy bare sessionId
    let openingRecon = await reconRepo.findOne({
      where: {
        scope: 'cash-session',
        scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId, kind: 'opening' }),
      },
    });
    if (!openingRecon) {
      const legacyRecons = await reconRepo.find({
        where: {
          scope: 'cash-session',
          scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId }),
        },
        order: { rangeStart: 'ASC' },
        take: 1,
      });
      openingRecon = legacyRecons[0] ?? null;
    }
    if (!openingRecon) return 0;

    const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
    const rows = await junctionRepo.find({
      where: { reconciliationId: openingRecon.id },
      relations: ['account'],
    });

    const matchingRow = rows.find(r => r.account?.code === accountCode);
    if (!matchingRow?.declaredAmountCents) return 0;
    return parseInt(matchingRow.declaredAmountCents, 10) || 0;
  }

  /**
   * Close a cashier session and calculate variance
   * Per-account closing amounts (like opening); posts per-account variance adjustments.
   */
  async closeSession(
    ctx: RequestContext,
    input: CloseSessionInput
  ): Promise<CashierSessionSummary> {
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
    if (!sessionId || sessionId === '-1') {
      throw new Error('Invalid session id');
    }

    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const session = await sessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${sessionId} not found`);
    }

    if (session.status === 'closed') {
      throw new Error(`Cashier session ${sessionId} is already closed`);
    }

    const requirements = await this.getChannelReconciliationRequirements(ctx, session.channelId);
    const requiredCodes = new Set(requirements.paymentMethods.map(pm => pm.ledgerAccountCode));
    const givenCodes = new Set(input.closingBalances.map(b => b.accountCode));
    const missing = [...requiredCodes].filter(c => !givenCodes.has(c));
    if (missing.length > 0) {
      throw new Error(
        `Closing must include every cashier-controlled account. Missing: ${missing.join(', ')}`
      );
    }

    const totalDeclared = input.closingBalances.reduce((sum, b) => sum + b.amountCents, 0);
    const channelId = session.channelId;

    return this.connection.withTransaction(ctx, async txCtx => {
      // 1. Record blind count for audit trail (skip automatic variance posting — we handle per-account below)
      const closingCount = await this.recordCashCount(txCtx, {
        sessionId,
        declaredCash: totalDeclared,
        countType: 'closing',
        skipVariancePosting: true,
      });

      // 2. Close the session
      const txSessionRepo = this.connection.getRepository(txCtx, CashierSession);
      const sessionInTx = await txSessionRepo.findOne({ where: { id: sessionId } });
      if (!sessionInTx) {
        throw new Error(`Cashier session ${sessionId} not found`);
      }
      sessionInTx.closedAt = new Date();
      sessionInTx.closingDeclared = String(totalDeclared);
      sessionInTx.status = 'closed';
      await txSessionRepo.save(sessionInTx);

      // 3. Build per-account declared amounts and create closing reconciliation
      const codes = input.closingBalances.map(b => b.accountCode);
      const byCode = await this.getAccountIdsByCode(txCtx, channelId, codes);
      const accountDeclaredAmounts: Record<string, string> = {};
      for (const { accountCode, amountCents } of input.closingBalances) {
        const accountId = byCode[accountCode];
        if (accountId) accountDeclaredAmounts[accountId] = String(amountCents);
      }
      const closingRecon = await this.createSessionReconciliation(
        txCtx,
        sessionId,
        input.notes,
        accountDeclaredAmounts
      );

      // 4. Post per-account variance adjustments (mirrors opening pattern)
      for (const { accountCode, amountCents } of input.closingBalances) {
        const openingForAccount = await this.getOpeningBalanceForAccount(
          txCtx,
          sessionId,
          accountCode
        );
        const sessionBalance = await this.ledgerQueryService.getSessionBalance(
          channelId,
          accountCode,
          sessionId
        );
        const expected = openingForAccount + sessionBalance.balance;
        const variance = amountCents - expected;
        if (variance !== 0) {
          await this.financialService.postVarianceAdjustment(
            txCtx,
            sessionId,
            accountCode,
            variance,
            'Closing balance variance',
            closingRecon.id
          );
        }
      }

      // 5. Return summary
      const summary = await this.getSessionSummary(txCtx, sessionId);
      this.logger.log(
        `Cashier session ${sessionId} closed. Expected: ${summary.openingFloat + summary.ledgerTotals.cashTotal}, Declared: ${totalDeclared}, Variance: ${summary.variance}, ClosingCountId: ${closingCount.count.id}`
      );
      return summary;
    });
  }

  /**
   * Get summary for a cashier session (can be open or closed)
   */
  async getSessionSummary(ctx: RequestContext, sessionId: string): Promise<CashierSessionSummary> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const session = await sessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${sessionId} not found`);
    }

    const ledgerTotals = await this.ledgerQueryService.getCashierSessionTotals(
      session.channelId,
      session.id
    );

    const openingFloat = await this.getOpeningBalanceForSession(ctx, session.id);
    const closingDeclared = parseInt(session.closingDeclared, 10);
    const expectedCash = openingFloat + ledgerTotals.cashTotal;
    const variance = session.status === 'closed' ? closingDeclared - expectedCash : 0;

    return {
      sessionId: session.id,
      cashierUserId: session.cashierUserId,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      status: session.status,
      openingFloat,
      closingDeclared,
      ledgerTotals,
      variance,
    };
  }

  /** UUID v4 format; ensures we never return or use placeholder/invalid ids (e.g. -1). */
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private static isValidSessionId(id: unknown): id is string {
    return typeof id === 'string' && OpenSessionService.UUID_REGEX.test(id.trim());
  }

  /**
   * Get current open session for a channel (if any).
   * Never returns a session with a non-UUID id (e.g. -1); such rows would be data corruption.
   */
  async getCurrentSession(ctx: RequestContext, channelId: number): Promise<CashierSession | null> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const session = await sessionRepo.findOne({
      where: {
        channelId,
        status: 'open',
      },
    });

    if (!session) return null;
    if (!OpenSessionService.isValidSessionId(session.id)) {
      this.logger.warn(
        `getCurrentSession: ignoring session with invalid id (channelId=${channelId}, id=${session.id}); possible data corruption`
      );
      return null;
    }
    return session;
  }

  /**
   * Require an open session for the channel. Throws if none exists.
   * Use this gate before any transaction that must be session-scoped.
   */
  async requireOpenSession(ctx: RequestContext, channelId: number): Promise<CashierSession> {
    const session = await this.getCurrentSession(ctx, channelId);
    if (!session) {
      throw new Error(
        'No open session for this channel. Open a session before performing transactions.'
      );
    }
    return session;
  }

  /**
   * Get sessions for a channel with optional filters
   */
  async getSessions(
    ctx: RequestContext,
    channelId: number,
    options?: {
      status?: 'open' | 'closed';
      startDate?: string;
      endDate?: string;
      take?: number;
      skip?: number;
    }
  ): Promise<{ items: CashierSession[]; totalItems: number }> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    let queryBuilder = sessionRepo
      .createQueryBuilder('session')
      .where('session.channelId = :channelId', { channelId });

    if (options?.status) {
      queryBuilder = queryBuilder.andWhere('session.status = :status', { status: options.status });
    }

    if (options?.startDate) {
      queryBuilder = queryBuilder.andWhere('session.openedAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      queryBuilder = queryBuilder.andWhere('session.openedAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    const totalItems = await queryBuilder.getCount();

    queryBuilder = queryBuilder.orderBy('session.openedAt', 'DESC');

    if (options?.take) {
      queryBuilder = queryBuilder.take(options.take);
    }

    if (options?.skip) {
      queryBuilder = queryBuilder.skip(options.skip);
    }

    const items = await queryBuilder.getMany();

    return { items, totalItems };
  }

  /**
   * List closed cashier sessions that have no closing reconciliation record.
   * Use for operational visibility and repair via createCashierSessionReconciliation(sessionId, notes).
   */
  async getClosedSessionsMissingReconciliation(
    ctx: RequestContext,
    channelId: number,
    options?: { startDate?: string; endDate?: string; take?: number; skip?: number }
  ): Promise<Array<{ sessionId: string; closedAt: Date }>> {
    const { items: closedSessions } = await this.getSessions(ctx, channelId, {
      status: 'closed',
      startDate: options?.startDate,
      endDate: options?.endDate,
      take: options?.take ?? 500,
      skip: options?.skip ?? 0,
    });

    if (closedSessions.length === 0) {
      return [];
    }

    const reconRepo = this.connection.getRepository(ctx, Reconciliation);

    const missing: Array<{ sessionId: string; closedAt: Date }> = [];
    for (const session of closedSessions) {
      if (!session.closedAt) continue;

      // Check for kind-specific closing reconciliation first, then legacy bare sessionId
      const kindRef = toScopeRefId({
        scope: 'cash-session',
        sessionId: session.id,
        kind: 'closing',
      });
      const legacyRef = toScopeRefId({ scope: 'cash-session', sessionId: session.id });
      const rangeStart = session.openedAt.toISOString().slice(0, 10);
      const rangeEnd = new Date(session.closedAt).toISOString().slice(0, 10);

      const existing = await reconRepo.findOne({
        where: [
          { channelId, scope: 'cash-session', scopeRefId: kindRef },
          { channelId, scope: 'cash-session', scopeRefId: legacyRef, rangeStart, rangeEnd },
        ],
      });
      if (!existing) {
        missing.push({
          sessionId: session.id,
          closedAt: session.closedAt!,
        });
      }
    }
    return missing;
  }

  /**
   * Create reconciliation record for a closed session.
   * When closingDeclaredAmounts is provided (from closeSession), stores per-account declared amounts; otherwise uses session total only.
   */
  async createSessionReconciliation(
    ctx: RequestContext,
    sessionId: string,
    notes?: string,
    closingDeclaredAmounts?: Record<string, string>
  ): Promise<Reconciliation> {
    const summary = await this.getSessionSummary(ctx, sessionId);

    if (summary.status !== 'closed') {
      throw new Error(
        `Cannot create reconciliation for open session ${sessionId}. Close the session first.`
      );
    }

    const channelId = await this.getSessionChannelId(ctx, sessionId);
    const scopeRefId = toScopeRefId({ scope: 'cash-session', sessionId, kind: 'closing' });
    const rangeStart = summary.openedAt.toISOString().slice(0, 10);
    const rangeEnd = (summary.closedAt || new Date()).toISOString().slice(0, 10);

    const reconRepo = this.connection.getRepository(ctx, Reconciliation);
    const existingClosing = await reconRepo.findOne({
      where: {
        channelId,
        scope: 'cash-session',
        scopeRefId,
        rangeStart,
        rangeEnd,
      },
    });
    if (existingClosing) {
      return existingClosing;
    }

    const expectedBalance = summary.openingFloat + summary.ledgerTotals.cashTotal;
    const accountIds = await this.getCashierControlledAccountIds(ctx, channelId);

    const actualBalance =
      closingDeclaredAmounts && Object.keys(closingDeclaredAmounts).length > 0
        ? Object.values(closingDeclaredAmounts)
            .reduce((s, v) => s + BigInt(v), BigInt(0))
            .toString()
        : summary.closingDeclared.toString();

    const input: CreateReconciliationInput = {
      channelId,
      scope: 'cash-session',
      scopeRefId,
      rangeStart,
      rangeEnd,
      expectedBalance: expectedBalance.toString(),
      actualBalance,
      notes: notes || `Cashier session reconciliation for session ${sessionId}`,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      accountDeclaredAmounts: closingDeclaredAmounts,
    };

    return this.reconciliationService.createReconciliation(ctx, input);
  }

  /**
   * Get ledger account IDs for cashier-controlled accounts in the channel (for reconciliation scope).
   */
  private async getCashierControlledAccountIds(
    ctx: RequestContext,
    channelId: number
  ): Promise<string[]> {
    const requirements = await this.getChannelReconciliationRequirements(ctx, channelId);
    const codes = [...new Set(requirements.paymentMethods.map(pm => pm.ledgerAccountCode))];
    if (codes.length === 0) return [];

    const accountRepo = this.connection.getRepository(ctx, Account);
    const accounts = await accountRepo.find({
      where: { channelId, code: In(codes) },
      select: ['id'],
    });
    return accounts.map(a => a.id);
  }

  /**
   * Get channel ID for a session
   */
  private async getSessionChannelId(ctx: RequestContext, sessionId: string): Promise<number> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const session = await sessionRepo.findOne({
      where: { id: sessionId },
      select: ['channelId'],
    });

    if (!session) {
      throw new Error(`Cashier session ${sessionId} not found`);
    }

    return session.channelId;
  }

  // ============================================================================
  // CASH CONTROL METHODS
  // ============================================================================

  /**
   * Record a blind cash count
   * Cashier declares their count WITHOUT seeing the expected amount.
   * System calculates variance internally but hides it from cashier.
   */
  async recordCashCount(
    ctx: RequestContext,
    input: RecordCashCountInput
  ): Promise<CashCountResult> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);

    const session = await sessionRepo.findOne({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${input.sessionId} not found`);
    }

    // Calculate expected cash from ledger
    const expectedCash = await this.calculateExpectedCash(ctx, session);

    // Calculate variance
    const variance = input.declaredCash - expectedCash;

    const countedByUserId = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;

    const count = countRepo.create({
      channelId: session.channelId,
      sessionId: session.id,
      countType: input.countType,
      takenAt: new Date(),
      declaredCash: input.declaredCash.toString(),
      expectedCash: expectedCash.toString(),
      variance: variance.toString(),
      varianceReason: input.varianceReason ?? null,
      countedByUserId,
    });

    const savedCount = await countRepo.save(count);

    const hasVariance = Math.abs(variance) > 0;

    if (hasVariance && !input.skipVariancePosting) {
      await this.financialService.postVarianceAdjustment(
        ctx,
        session.id,
        ACCOUNT_CODES.CASH_ON_HAND,
        variance,
        input.varianceReason ?? 'Session count variance',
        savedCount.id
      );
    }

    this.logger.log(
      `Cash count recorded for session ${session.id}. ` +
        `Type: ${input.countType}, Declared: ${input.declaredCash}, ` +
        `Expected: ${expectedCash}, Variance: ${variance}`
    );

    // Check if we should notify managers about variance
    if (hasVariance) {
      const threshold = await this.getVarianceNotificationThreshold(ctx, session.channelId);
      if (Math.abs(variance) >= threshold) {
        // TODO: Trigger notification to managers
        this.logger.warn(
          `Cash variance detected for session ${session.id}: ${variance} cents ` +
            `(threshold: ${threshold})`
        );
      }
    }

    return {
      count: savedCount,
      hasVariance,
      varianceHidden: true, // Always hidden for cashiers
    };
  }

  /**
   * Calculate expected cash for a session
   * Internal method - not exposed to cashiers
   */
  private async calculateExpectedCash(
    ctx: RequestContext,
    session: CashierSession
  ): Promise<number> {
    const openingTotal = await this.getOpeningBalanceForSession(ctx, session.id);
    const ledgerTotals = await this.ledgerQueryService.getCashierSessionTotals(
      session.channelId,
      session.id
    );
    return openingTotal + ledgerTotals.cashTotal;
  }

  /**
   * Get variance notification threshold for a channel
   */
  private async getVarianceNotificationThreshold(
    ctx: RequestContext,
    channelId: number
  ): Promise<number> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      return 100; // Default 1 KES
    }

    return (channel as any).customFields?.varianceNotificationThreshold ?? 100;
  }

  /**
   * Manager reviews a cash count - reveals full variance details
   */
  async reviewCashCount(
    ctx: RequestContext,
    countId: string,
    notes?: string
  ): Promise<CashDrawerCount> {
    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);

    const count = await countRepo.findOne({
      where: { id: countId },
    });

    if (!count) {
      throw new Error(`Cash count ${countId} not found`);
    }

    if (count.reviewedByUserId) {
      this.logger.debug(`Cash count ${countId} already reviewed`);
      return count;
    }

    const reviewedByUserId = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : null;

    count.reviewedByUserId = reviewedByUserId;
    count.reviewedAt = new Date();
    count.reviewNotes = notes || null;

    const savedCount = await countRepo.save(count);

    this.logger.log(
      `Cash count ${countId} reviewed by user ${reviewedByUserId}. ` + `Variance: ${count.variance}`
    );

    return savedCount;
  }

  /**
   * Cashier explains a variance
   */
  async explainVariance(
    ctx: RequestContext,
    countId: string,
    reason: string
  ): Promise<CashDrawerCount> {
    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);

    const count = await countRepo.findOne({
      where: { id: countId },
    });

    if (!count) {
      throw new Error(`Cash count ${countId} not found`);
    }

    count.varianceReason = reason;

    const savedCount = await countRepo.save(count);

    this.logger.log(`Variance explanation added for count ${countId}: "${reason}"`);

    return savedCount;
  }

  /**
   * Get all cash counts for a session
   */
  async getSessionCashCounts(ctx: RequestContext, sessionId: string): Promise<CashDrawerCount[]> {
    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);

    return countRepo.find({
      where: { sessionId },
      order: { takenAt: 'ASC' },
    });
  }

  /**
   * Get pending variance reviews for a channel
   * Returns counts with variance that haven't been reviewed
   */
  async getPendingVarianceReviews(
    ctx: RequestContext,
    channelId: number
  ): Promise<CashDrawerCount[]> {
    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);

    return countRepo
      .createQueryBuilder('count')
      .where('count.channelId = :channelId', { channelId })
      .andWhere('count.variance != :zero', { zero: '0' })
      .andWhere('count.reviewedByUserId IS NULL')
      .orderBy('count.takenAt', 'DESC')
      .getMany();
  }

  /**
   * Verify M-Pesa transactions for a session
   * Cashier confirms all M-Pesa payments were received at the till
   */
  async verifyMpesaTransactions(
    ctx: RequestContext,
    input: VerifyMpesaInput
  ): Promise<MpesaVerification> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const verificationRepo = this.connection.getRepository(ctx, MpesaVerification);

    const session = await sessionRepo.findOne({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${input.sessionId} not found`);
    }

    // Get M-Pesa transaction count from ledger
    const ledgerTotals = await this.ledgerQueryService.getCashierSessionTotals(
      session.channelId,
      session.id
    );

    // For now, we estimate transaction count from the total
    // In a real implementation, you'd query individual M-Pesa transactions
    const transactionCount = ledgerTotals.mpesaTotal > 0 ? 1 : 0; // Placeholder

    const verifiedByUserId = ctx.activeUserId ? parseInt(ctx.activeUserId.toString(), 10) : 0;

    const verification = verificationRepo.create({
      channelId: session.channelId,
      sessionId: session.id,
      verifiedAt: new Date(),
      transactionCount,
      allConfirmed: input.allConfirmed,
      flaggedTransactionIds: input.flaggedTransactionIds
        ? JSON.stringify(input.flaggedTransactionIds)
        : null,
      notes: input.notes || null,
      verifiedByUserId,
    });

    const savedVerification = await verificationRepo.save(verification);

    this.logger.log(
      `M-Pesa verification recorded for session ${session.id}. ` +
        `All confirmed: ${input.allConfirmed}, Flagged: ${input.flaggedTransactionIds?.length || 0}`
    );

    return savedVerification;
  }

  /**
   * Get M-Pesa verifications for a session
   */
  async getSessionMpesaVerifications(
    ctx: RequestContext,
    sessionId: string
  ): Promise<MpesaVerification[]> {
    const verificationRepo = this.connection.getRepository(ctx, MpesaVerification);

    return verificationRepo.find({
      where: { sessionId },
      order: { verifiedAt: 'DESC' },
    });
  }

  // ============================================================================
  // RECONCILIATION REQUIREMENTS (Driven by Payment Method Configuration)
  // ============================================================================

  /**
   * Get reconciliation requirements for a session based on payment method config
   * Queries payment methods to determine what reconciliation is needed at close
   */
  async getSessionReconciliationRequirements(
    ctx: RequestContext,
    sessionId: string
  ): Promise<SessionReconciliationRequirements> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const session = await sessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${sessionId} not found`);
    }

    const paymentMethods = await this.channelPaymentMethodService.getChannelPaymentMethods(
      ctx,
      session.channelId
    );

    // Filter to enabled, cashier-controlled payment methods
    const cashierControlled = paymentMethods.filter(
      pm => pm.enabled && isCashierControlledPaymentMethod(pm)
    );

    // Map to reconciliation config
    const paymentMethodConfigs: PaymentMethodReconciliationConfig[] = cashierControlled.map(pm => ({
      paymentMethodId: pm.id.toString(),
      paymentMethodCode: pm.code,
      paymentMethodName: this.channelPaymentMethodService.getPaymentMethodDisplayName(pm),
      reconciliationType: getReconciliationTypeFromPaymentMethod(pm),
      ledgerAccountCode: getAccountCodeFromPaymentMethod(pm),
      isCashierControlled: isCashierControlledPaymentMethod(pm),
      requiresReconciliation: requiresReconciliation(pm),
    }));

    return {
      blindCountRequired: paymentMethodConfigs.some(pm => pm.reconciliationType === 'blind_count'),
      verificationRequired: paymentMethodConfigs.some(
        pm => pm.reconciliationType === 'transaction_verification'
      ),
      paymentMethods: paymentMethodConfigs,
    };
  }

  /**
   * Get reconciliation requirements for a channel (not session-specific)
   */
  async getChannelReconciliationRequirements(
    ctx: RequestContext,
    channelId: number
  ): Promise<SessionReconciliationRequirements> {
    const paymentMethods = await this.channelPaymentMethodService.getChannelPaymentMethods(
      ctx,
      channelId
    );

    // Filter to enabled, cashier-controlled payment methods
    const cashierControlled = paymentMethods.filter(
      pm => pm.enabled && isCashierControlledPaymentMethod(pm)
    );

    // Map to reconciliation config
    const paymentMethodConfigs: PaymentMethodReconciliationConfig[] = cashierControlled.map(pm => ({
      paymentMethodId: pm.id.toString(),
      paymentMethodCode: pm.code,
      paymentMethodName: this.channelPaymentMethodService.getPaymentMethodDisplayName(pm),
      reconciliationType: getReconciliationTypeFromPaymentMethod(pm),
      ledgerAccountCode: getAccountCodeFromPaymentMethod(pm),
      isCashierControlled: isCashierControlledPaymentMethod(pm),
      requiresReconciliation: requiresReconciliation(pm),
    }));

    return {
      blindCountRequired: paymentMethodConfigs.some(pm => pm.reconciliationType === 'blind_count'),
      verificationRequired: paymentMethodConfigs.some(
        pm => pm.reconciliationType === 'transaction_verification'
      ),
      paymentMethods: paymentMethodConfigs,
    };
  }
}
