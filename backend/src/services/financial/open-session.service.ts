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
 * Close Session Input
 */
export interface CloseSessionInput {
  sessionId: string;
  closingDeclared: number; // Amount declared by cashier (in cents)
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
 * Payment method reconciliation config for a session
 */
export interface PaymentMethodReconciliationConfig {
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  reconciliationType: 'blind_count' | 'transaction_verification' | 'statement_match' | 'none';
  ledgerAccountCode: string;
  isCashierControlled: boolean;
  requiresReconciliation: boolean;
}

/**
 * Session reconciliation requirements
 * Derived from payment method configuration
 */
export interface SessionReconciliationRequirements {
  blindCountRequired: boolean;
  verificationRequired: boolean;
  paymentMethods: PaymentMethodReconciliationConfig[];
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
    private readonly financialService: FinancialService
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

    const today = savedSession.openedAt.toISOString().slice(0, 10);
    const accountIds = await this.getCashierControlledAccountIds(ctx, input.channelId);
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

    const openingRecon = await this.reconciliationService.createReconciliation(ctx, {
      channelId: input.channelId,
      scope: 'cash-session',
      scopeRefId: savedSession.id,
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

    const openingRecons = await reconRepo.find({
      where: { scope: 'cash-session', scopeRefId: sessionId },
      order: { rangeStart: 'ASC' },
      take: 1,
    });
    const openingRecon = openingRecons[0];
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
   * Close a cashier session and calculate variance
   * Automatically creates a closing cash count record
   */
  async closeSession(
    ctx: RequestContext,
    input: CloseSessionInput
  ): Promise<CashierSessionSummary> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    const session = await sessionRepo.findOne({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new Error(`Cashier session ${input.sessionId} not found`);
    }

    if (session.status === 'closed') {
      throw new Error(`Cashier session ${input.sessionId} is already closed`);
    }

    // Create a closing cash count (blind count)
    const closingCount = await this.recordCashCount(ctx, {
      sessionId: input.sessionId,
      declaredCash: input.closingDeclared,
      countType: 'closing',
    });

    const ledgerTotals = await this.ledgerQueryService.getCashierSessionTotals(
      session.channelId,
      session.id
    );

    session.closedAt = new Date();
    session.closingDeclared = input.closingDeclared.toString();
    session.status = 'closed';
    await sessionRepo.save(session);

    await this.createSessionReconciliation(ctx, session.id, input.notes);

    const openingTotal = await this.getOpeningBalanceForSession(ctx, session.id);
    const expectedCash = openingTotal + ledgerTotals.cashTotal;
    const variance = input.closingDeclared - expectedCash;

    this.logger.log(
      `Cashier session ${session.id} closed. Expected: ${expectedCash}, Declared: ${input.closingDeclared}, Variance: ${variance}, ClosingCountId: ${closingCount.count.id}`
    );

    return {
      sessionId: session.id,
      cashierUserId: session.cashierUserId,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      status: session.status,
      openingFloat: openingTotal,
      closingDeclared: input.closingDeclared,
      ledgerTotals,
      variance,
    };
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

  /**
   * Get current open session for a channel (if any)
   */
  async getCurrentSession(ctx: RequestContext, channelId: number): Promise<CashierSession | null> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    return sessionRepo.findOne({
      where: {
        channelId,
        status: 'open',
      },
    });
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
   * Create reconciliation record for a closed session
   */
  async createSessionReconciliation(
    ctx: RequestContext,
    sessionId: string,
    notes?: string
  ): Promise<Reconciliation> {
    const summary = await this.getSessionSummary(ctx, sessionId);

    if (summary.status !== 'closed') {
      throw new Error(
        `Cannot create reconciliation for open session ${sessionId}. Close the session first.`
      );
    }

    const expectedBalance = summary.openingFloat + summary.ledgerTotals.cashTotal;
    const channelId = await this.getSessionChannelId(ctx, sessionId);
    const accountIds = await this.getCashierControlledAccountIds(ctx, channelId);

    const input: CreateReconciliationInput = {
      channelId,
      scope: 'cash-session',
      scopeRefId: sessionId,
      rangeStart: summary.openedAt.toISOString().slice(0, 10),
      rangeEnd: (summary.closedAt || new Date()).toISOString().slice(0, 10),
      expectedBalance: expectedBalance.toString(),
      actualBalance: summary.closingDeclared.toString(),
      notes: notes || `Cashier session reconciliation for session ${sessionId}`,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
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

    if (hasVariance) {
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

    const paymentMethods = await this.getChannelPaymentMethods(ctx, session.channelId);

    // Filter to enabled, cashier-controlled payment methods
    const cashierControlled = paymentMethods.filter(
      pm => pm.enabled && isCashierControlledPaymentMethod(pm)
    );

    // Map to reconciliation config
    const paymentMethodConfigs: PaymentMethodReconciliationConfig[] = cashierControlled.map(pm => ({
      paymentMethodId: pm.id.toString(),
      paymentMethodCode: pm.code,
      paymentMethodName: this.getPaymentMethodDisplayName(pm),
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
    const paymentMethods = await this.getChannelPaymentMethods(ctx, channelId);

    // Filter to enabled, cashier-controlled payment methods
    const cashierControlled = paymentMethods.filter(
      pm => pm.enabled && isCashierControlledPaymentMethod(pm)
    );

    // Map to reconciliation config
    const paymentMethodConfigs: PaymentMethodReconciliationConfig[] = cashierControlled.map(pm => ({
      paymentMethodId: pm.id.toString(),
      paymentMethodCode: pm.code,
      paymentMethodName: this.getPaymentMethodDisplayName(pm),
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
   * Display name for a payment method (translation name or code fallback).
   */
  private getPaymentMethodDisplayName(pm: PaymentMethod): string {
    const t = (pm as { translations?: Array<{ name: string }> }).translations;
    const name = t?.[0]?.name;
    return name && name.trim() ? name : pm.code;
  }

  /**
   * Get all payment methods for a channel
   */
  private async getChannelPaymentMethods(
    ctx: RequestContext,
    channelId: number
  ): Promise<PaymentMethod[]> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['paymentMethods', 'paymentMethods.translations'],
    });

    return channel?.paymentMethods || [];
  }
}
