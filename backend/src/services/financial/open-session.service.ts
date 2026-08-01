import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  Administrator,
  Channel,
  ChannelService,
  EventBus,
  PaymentMethod,
  RequestContext,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { ShiftSessionEvent } from '../../infrastructure/events/custom-events';
import { In } from 'typeorm';
import { CashDrawerCount, CashCountType } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { Account } from '../../ledger/account.entity';
import { JournalEntry } from '../../ledger/journal-entry.entity';
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
import { AuditService } from '../../infrastructure/audit/audit.service';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import { ApprovalService } from '../approval/approval.service';

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
  /** Full-ledger expected summed across all cashier-controlled accounts (as of close date, or today when open). */
  expectedTotal: number;
  variance: number; // closingDeclared - expectedTotal, where expectedTotal is the full-ledger sum across cashier-controlled accounts
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
    private readonly channelPaymentMethodService: ChannelPaymentMethodService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
    private readonly channelService: ChannelService,
    @Optional() private readonly approvalService?: ApprovalService
  ) {}

  /**
   * Approval-request plumbing for variance reviews. Never throws: a failure here must
   * not affect session open/close or ledger posting.
   */
  private async createVarianceReviewRequest(
    ctx: RequestContext,
    params: {
      channelId: number;
      sessionId: string;
      reconciliationId: string;
      accountCode: string;
      declaredCents: number;
      expectedCents: number;
      varianceCents: number;
    }
  ): Promise<void> {
    if (!this.approvalService) return;
    try {
      await this.approvalService.createApprovalRequest(ctx, {
        type: 'cash_variance',
        entityType: 'Reconciliation',
        entityId: params.reconciliationId,
        metadata: {
          sessionId: params.sessionId,
          reconciliationId: params.reconciliationId,
          accountCode: params.accountCode,
          declaredCents: params.declaredCents,
          expectedCents: params.expectedCents,
          varianceCents: params.varianceCents,
          direction: params.varianceCents < 0 ? 'short' : 'over',
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create cash_variance review request for account ${params.accountCode}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Expire still-pending variance reviews for an account when a new reconciliation
   * is posted for it — the review window has closed and the ledger has moved on.
   */
  private async expireVarianceReviewRequests(
    ctx: RequestContext,
    channelId: number,
    accountCode: string
  ): Promise<void> {
    if (!this.approvalService) return;
    try {
      await this.approvalService.expirePendingRequests(ctx, {
        channelId,
        type: 'cash_variance',
        metadataMatch: { accountCode },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to expire cash_variance review requests for account ${accountCode}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

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
    const declaredAmounts = input.openingBalances.map(b => ({
      accountCode: b.accountCode,
      amountCents: String(b.amountCents),
    }));

    // Group by accountCode and sum (handle duplicate accounts from multiple payment methods)
    const declaredByAccount = new Map<string, number>();
    for (const b of input.openingBalances) {
      const existing = declaredByAccount.get(b.accountCode) ?? 0;
      declaredByAccount.set(b.accountCode, existing + b.amountCents);
    }
    const totalDeclared = [...declaredByAccount.values()].reduce((s, v) => s + v, 0);

    // Compute expected per account (full ledger as of today) and variance
    const perAccount: Array<{
      accountCode: string;
      declaredCents: number;
      expectedCents: number;
      varianceCents: number;
    }> = [];
    let totalExpected = 0;
    for (const [accountCode, declaredCents] of declaredByAccount) {
      const expectedCents = await this.ledgerQueryService.getExpectedBalanceForReconciliation(
        input.channelId,
        'manual',
        'opening',
        accountCode,
        today
      );
      const varianceCents = declaredCents - expectedCents;
      totalExpected += expectedCents;
      perAccount.push({ accountCode, declaredCents, expectedCents, varianceCents });
    }
    const openingRecon = await this.reconciliationService.createReconciliation(
      ctx,
      {
        channelId: input.channelId,
        scope: 'cash-session',
        scopeRefId: toScopeRefId({
          scope: 'cash-session',
          sessionId: savedSession.id,
          kind: 'opening',
        }),
        expectedBalance: String(totalExpected),
        actualBalance: String(totalDeclared),
        notes: `Opening reconciliation for session ${savedSession.id}`,
        declaredAmounts,
      },
      { snapshotDate: today }
    );

    this.auditService
      .log(ctx, AUDIT_EVENTS.CASHIER_SESSION_RECONCILIATION_CREATED, {
        entityType: 'Reconciliation',
        entityId: openingRecon.id,
        data: { sessionId: savedSession.id, kind: 'opening' },
        channelId: input.channelId,
      })
      .catch(() => {});

    // A new opening reconciliation supersedes any still-pending variance reviews
    // for these accounts (the ledger has moved on).
    for (const { accountCode } of perAccount) {
      await this.expireVarianceReviewRequests(ctx, input.channelId, accountCode);
    }

    // Post variance only when declared differs from expected (not full amount)
    for (const { accountCode, declaredCents, expectedCents, varianceCents } of perAccount) {
      if (varianceCents !== 0) {
        await this.financialService.postVarianceAdjustment(
          ctx,
          savedSession.id,
          accountCode,
          varianceCents,
          'Opening balance',
          openingRecon.id
        );
        await this.createVarianceReviewRequest(ctx, {
          channelId: input.channelId,
          sessionId: savedSession.id,
          reconciliationId: openingRecon.id,
          accountCode,
          declaredCents,
          expectedCents,
          varianceCents,
        });
      }
    }

    this.logger.log(
      `Cashier session ${savedSession.id} started for channel ${input.channelId} by user ${cashierUserId} (per-account opening)`
    );

    const [cashierName, storeName] = await Promise.all([
      this.getCashierName(ctx, cashierUserId),
      this.getStoreName(ctx, input.channelId),
    ]);
    const totalOpeningVariance = perAccount.reduce((sum, a) => sum + a.varianceCents, 0);

    this.eventBus.publish(
      new ShiftSessionEvent(ctx, String(input.channelId), 'opened', savedSession.id, {
        sessionId: savedSession.id,
        openedAt: savedSession.openedAt?.toISOString?.(),
        cashierUserId,
        cashierName,
        storeName,
        openingBalances: perAccount.map(a => ({
          accountCode: a.accountCode,
          declaredCents: a.declaredCents,
          expectedCents: a.expectedCents,
          varianceCents: a.varianceCents,
        })),
        totalOpeningVariance,
      })
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
        order: { snapshotAt: 'ASC' },
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
        order: { snapshotAt: 'ASC' },
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
      // 1. Record blind count for audit trail (skip automatic variance posting — we handle per-account below).
      // The count is a cash-drawer count: declare only the CASH_ON_HAND portion so it is
      // compared against the full-ledger cash balance (cash-vs-cash). Channels without a
      // cash account have no drawer to count — skip the count entirely.
      const cashDeclared = input.closingBalances.find(
        b => b.accountCode === ACCOUNT_CODES.CASH_ON_HAND
      )?.amountCents;
      const closingCount =
        cashDeclared != null
          ? await this.recordCashCount(txCtx, {
              sessionId,
              declaredCash: cashDeclared,
              countType: 'closing',
              skipVariancePosting: true,
            })
          : null;

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
      const declaredAmounts = input.closingBalances.map(b => ({
        accountCode: b.accountCode,
        amountCents: String(b.amountCents),
      }));
      const closingRecon = await this.createSessionReconciliation(
        txCtx,
        sessionId,
        input.notes,
        declaredAmounts
      );

      this.auditService
        .log(txCtx, AUDIT_EVENTS.CASHIER_SESSION_RECONCILIATION_CREATED, {
          entityType: 'Reconciliation',
          entityId: closingRecon.id,
          data: { sessionId, kind: 'closing' },
          channelId,
        })
        .catch(() => {});

      // 4. Post per-account variance adjustments (shared path with repair flow)
      await this.postClosingVariance(txCtx, sessionId, closingRecon);

      // 5. Return summary
      const summary = await this.getSessionSummary(txCtx, sessionId);
      this.logger.log(
        `Cashier session ${sessionId} closed. Expected: ${summary.ledgerTotals.cashTotal}, Declared: ${totalDeclared}, Variance: ${summary.variance}, ClosingCountId: ${closingCount?.count.id ?? 'none'}`
      );

      const [cashierName, storeName, salesBreakdown, purchases] = await Promise.all([
        this.getCashierName(txCtx, session.cashierUserId),
        this.getStoreName(txCtx, channelId),
        this.ledgerQueryService.getSalesBreakdown(
          channelId,
          session.openedAt.toISOString().slice(0, 10),
          summary.closedAt ? summary.closedAt.toISOString().slice(0, 10) : undefined
        ),
        this.ledgerQueryService.getPurchaseTotal(
          channelId,
          session.openedAt.toISOString().slice(0, 10),
          summary.closedAt ? summary.closedAt.toISOString().slice(0, 10) : undefined
        ),
      ]);
      const channelSettings = await this.channelService.findOne(txCtx, channelId);
      const varianceThresholdCents =
        ((channelSettings?.customFields as Record<string, unknown> | undefined)
          ?.varianceNotificationThreshold as number | undefined) ?? 100;

      this.eventBus.publish(
        new ShiftSessionEvent(txCtx, String(channelId), 'closed', sessionId, {
          sessionId,
          openedAt: summary.openedAt?.toISOString?.(),
          closedAt: summary.closedAt?.toISOString?.(),
          cashierUserId: session.cashierUserId,
          cashierName,
          storeName,
          cashSales: salesBreakdown.cashSales,
          creditSales: salesBreakdown.creditSales,
          purchases,
          cashTotal: summary.ledgerTotals.cashTotal,
          mpesaTotal: summary.ledgerTotals.mpesaTotal,
          totalCollected: summary.ledgerTotals.totalCollected,
          closingDeclared: summary.closingDeclared,
          variance: summary.variance,
          varianceThresholdCents,
        })
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

    // Expected = full-ledger balance summed across all cashier-controlled accounts.
    // Same scope ('manual' + snapshot date) as opening/closing variance posting so
    // summary variance always equals the sum of per-account closing variances.
    const requirements = await this.getChannelReconciliationRequirements(ctx, session.channelId);
    const accountCodes = [...new Set(requirements.paymentMethods.map(pm => pm.ledgerAccountCode))];
    // Align the as-of date with the closing reconciliation's snapshot date (which
    // postClosingVariance used) so summary and posted per-account variances match even
    // when the recon was created on a different day than closedAt (repair flow).
    let asOfDate = (session.closedAt ?? new Date()).toISOString().slice(0, 10);
    if (session.status === 'closed') {
      const reconRepo = this.connection.getRepository(ctx, Reconciliation);
      const closingRecon = await reconRepo.findOne({
        where: {
          channelId: session.channelId,
          scope: 'cash-session',
          scopeRefId: toScopeRefId({
            scope: 'cash-session',
            sessionId: session.id,
            kind: 'closing',
          }),
        },
        order: { snapshotAt: 'DESC' },
      });
      if (closingRecon?.snapshotAt) {
        asOfDate = String(closingRecon.snapshotAt).slice(0, 10);
      }
    }
    const expectedParts = await Promise.all(
      accountCodes.map(code =>
        this.ledgerQueryService.getExpectedBalanceForReconciliation(
          session.channelId,
          'manual',
          session.id,
          code,
          asOfDate
        )
      )
    );
    const expectedTotal = expectedParts.reduce((sum, v) => sum + v, 0);

    const openingFloat = await this.getOpeningBalanceForSession(ctx, session.id);
    const closingDeclared = parseInt(session.closingDeclared, 10);
    const variance = session.status === 'closed' ? closingDeclared - expectedTotal : 0;

    return {
      sessionId: session.id,
      cashierUserId: session.cashierUserId,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      status: session.status,
      openingFloat,
      closingDeclared,
      ledgerTotals,
      expectedTotal,
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
      const snapshotAt = new Date(session.closedAt).toISOString().slice(0, 10);

      const existing = await reconRepo.findOne({
        where: [
          { channelId, scope: 'cash-session', scopeRefId: kindRef },
          { channelId, scope: 'cash-session', scopeRefId: legacyRef, snapshotAt },
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
   * When declaredAmounts is provided (from closeSession), uses per-account amounts; otherwise builds synthetic from session total.
   */
  async createSessionReconciliation(
    ctx: RequestContext,
    sessionId: string,
    notes?: string,
    declaredAmounts?: Array<{ accountCode: string; amountCents: string }>
  ): Promise<Reconciliation> {
    const summary = await this.getSessionSummary(ctx, sessionId);

    if (summary.status !== 'closed') {
      throw new Error(
        `Cannot create reconciliation for open session ${sessionId}. Close the session first.`
      );
    }

    const channelId = await this.getSessionChannelId(ctx, sessionId);
    const scopeRefId = toScopeRefId({ scope: 'cash-session', sessionId, kind: 'closing' });
    const snapshotDate = (summary.closedAt || new Date()).toISOString().slice(0, 10);

    const reconRepo = this.connection.getRepository(ctx, Reconciliation);
    const existingClosing = await reconRepo.findOne({
      where: {
        channelId,
        scope: 'cash-session',
        scopeRefId,
        snapshotAt: snapshotDate,
      },
    });
    if (existingClosing) {
      return existingClosing;
    }

    const total = summary.closingDeclared;

    const effectiveDeclaredAmounts: Array<{ accountCode: string; amountCents: string }> =
      declaredAmounts && declaredAmounts.length > 0
        ? declaredAmounts
        : await this.buildSyntheticDeclaredAmounts(ctx, channelId, Number(total));

    const accountCodes = effectiveDeclaredAmounts.map(d => d.accountCode);
    const expectedBalance = await this.sumExpectedBalanceForAccounts(
      ctx,
      channelId,
      sessionId,
      accountCodes,
      snapshotDate
    );

    const actualBalance =
      effectiveDeclaredAmounts.length > 0
        ? effectiveDeclaredAmounts
            .reduce((s, d) => s + BigInt(d.amountCents || '0'), BigInt(0))
            .toString()
        : total.toString();

    const codeToId = await this.getAccountIdsByCode(ctx, channelId, accountCodes);
    const expectedAmountCentsByAccountId: Record<string, string> = {};
    for (const d of effectiveDeclaredAmounts) {
      const accountId = codeToId[d.accountCode];
      if (!accountId) continue;
      const expected = await this.ledgerQueryService.getExpectedBalanceForReconciliation(
        channelId,
        'manual',
        scopeRefId,
        d.accountCode,
        snapshotDate
      );
      expectedAmountCentsByAccountId[accountId] = String(expected);
    }

    const input: CreateReconciliationInput = {
      channelId,
      scope: 'cash-session',
      scopeRefId,
      expectedBalance: expectedBalance.toString(),
      actualBalance,
      notes: notes || `Cashier session reconciliation for session ${sessionId}`,
      declaredAmounts: effectiveDeclaredAmounts,
    };

    const recon = await this.reconciliationService.createReconciliation(ctx, input, {
      snapshotDate,
      expectedAmountCentsByAccountId,
    });

    // A new closing reconciliation supersedes any still-pending variance reviews
    // for these accounts (the ledger has moved on).
    for (const d of effectiveDeclaredAmounts) {
      await this.expireVarianceReviewRequests(ctx, channelId, d.accountCode);
    }

    return recon;
  }

  /**
   * Post per-account variance for a closing reconciliation (shared by close and repair).
   * Uses full-ledger expected as of reconciliation snapshot so variance aligns ledger with declared;
   * next session open then shows correct expected. Variance = declared - expected (shortage negative).
   */
  private async postClosingVariance(
    ctx: RequestContext,
    sessionId: string,
    closingRecon: Reconciliation
  ): Promise<void> {
    const channelId = closingRecon.channelId;
    const snapshotAt = closingRecon.snapshotAt ?? new Date().toISOString().slice(0, 10);
    const junctionRepo = this.connection.getRepository(ctx, ReconciliationAccount);
    const rows = await junctionRepo.find({
      where: { reconciliationId: closingRecon.id },
      relations: ['account'],
    });
    for (const row of rows) {
      if (!row.account?.code) continue;
      const declaredCents = row.declaredAmountCents ? parseInt(row.declaredAmountCents, 10) : 0;
      const expected = await this.ledgerQueryService.getExpectedBalanceForReconciliation(
        channelId,
        'manual',
        closingRecon.scopeRefId,
        row.account.code,
        snapshotAt
      );
      const variance = declaredCents - expected;
      if (variance !== 0) {
        // Only create a review item when this is a fresh posting — repair re-runs
        // (createCashierSessionReconciliation) hit the same idempotent sourceId and
        // must not spawn duplicate action items.
        const sourceId = `${sessionId}-${row.account.code}-${closingRecon.id}`;
        const alreadyPosted = await this.connection.getRepository(ctx, JournalEntry).findOne({
          where: { channelId, sourceType: 'variance-adjustment', sourceId },
          select: ['id'],
        });
        await this.financialService.postVarianceAdjustment(
          ctx,
          sessionId,
          row.account.code,
          variance,
          'Closing balance variance',
          closingRecon.id
        );
        if (!alreadyPosted) {
          await this.createVarianceReviewRequest(ctx, {
            channelId,
            sessionId,
            reconciliationId: closingRecon.id,
            accountCode: row.account.code,
            declaredCents,
            expectedCents: expected,
            varianceCents: variance,
          });
        }
      }
    }
  }

  /**
   * Create closing reconciliation record and post variance (repair flow).
   * Same outcome as normal close: record + ledger adjustment. Idempotent on repeat calls.
   */
  async createSessionReconciliationWithVariancePosting(
    ctx: RequestContext,
    sessionId: string,
    notes?: string
  ): Promise<Reconciliation> {
    const recon = await this.createSessionReconciliation(ctx, sessionId, notes);
    await this.postClosingVariance(ctx, sessionId, recon);
    return recon;
  }

  /**
   * Sum expected balance for the given account codes (for recon record).
   * When asOfDate is provided (e.g. closing recon): full-ledger as of that date (scope 'manual').
   * When not provided: session-scoped balance (scope 'cash-session', for backward compatibility).
   */
  private async sumExpectedBalanceForAccounts(
    ctx: RequestContext,
    channelId: number,
    sessionId: string,
    accountCodes: string[],
    asOfDate?: string
  ): Promise<number> {
    if (accountCodes.length === 0) return 0;
    const scope = asOfDate ? 'manual' : 'cash-session';
    const scopeRefId = asOfDate ? '' : sessionId;
    let sum = 0;
    for (const code of accountCodes) {
      sum += await this.ledgerQueryService.getExpectedBalanceForReconciliation(
        channelId,
        scope,
        scopeRefId,
        code,
        asOfDate
      );
    }
    return sum;
  }

  /** Build synthetic declaredAmounts for standalone createCashierSessionReconciliation (first account gets total, rest 0). */
  private async buildSyntheticDeclaredAmounts(
    ctx: RequestContext,
    channelId: number,
    totalCents: number
  ): Promise<Array<{ accountCode: string; amountCents: string }>> {
    const requirements = await this.getChannelReconciliationRequirements(ctx, channelId);
    const codes = [...new Set(requirements.paymentMethods.map(pm => pm.ledgerAccountCode))];
    if (codes.length === 0) {
      // Fallback: use CASH_ON_HAND when no payment method config exists
      const fallbackCode = ACCOUNT_CODES.CASH_ON_HAND;
      const accountRepo = this.connection.getRepository(ctx, Account);
      const exists = await accountRepo.findOne({ where: { channelId, code: fallbackCode } });
      if (exists) {
        return [{ accountCode: fallbackCode, amountCents: String(totalCents) }];
      }
      return [];
    }
    return codes.map((code, i) => ({
      accountCode: code,
      amountCents: i === 0 ? String(totalCents) : '0',
    }));
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

  /**
   * Get display name for a cashier user.
   */
  private async getCashierName(ctx: RequestContext, userId: number): Promise<string> {
    try {
      const admin = await this.connection.rawConnection.getRepository(Administrator).findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      if (admin) {
        const parts = [admin.firstName, admin.lastName].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
      }
      const user = await this.connection.rawConnection
        .getRepository(User)
        .findOne({ where: { id: userId.toString() } });
      return user?.identifier || `User ${userId}`;
    } catch {
      return `User ${userId}`;
    }
  }

  /**
   * Get store name for a channel.
   */
  private async getStoreName(ctx: RequestContext, channelId: number): Promise<string> {
    try {
      const channel = await this.channelService.findOne(ctx, channelId);
      return (channel as any)?.name || channel?.code || `Store ${channelId}`;
    } catch {
      return `Store ${channelId}`;
    }
  }

  /**
   * Format a cent amount as KES string.
   */
  private formatCents(cents: number): string {
    return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
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
      // A new count supersedes any still-pending variance review for this account.
      await this.expireVarianceReviewRequests(ctx, session.channelId, ACCOUNT_CODES.CASH_ON_HAND);
      await this.financialService.postVarianceAdjustment(
        ctx,
        session.id,
        ACCOUNT_CODES.CASH_ON_HAND,
        variance,
        input.varianceReason ?? 'Session count variance',
        savedCount.id
      );
      // Same contract as session open/close: the declared value becomes ledger truth
      // and the variance is surfaced as a reviewable action item (approve = revert).
      await this.createVarianceReviewRequest(ctx, {
        channelId: session.channelId,
        sessionId: session.id,
        reconciliationId: savedCount.id,
        accountCode: ACCOUNT_CODES.CASH_ON_HAND,
        declaredCents: input.declaredCash,
        expectedCents: expectedCash,
        varianceCents: variance,
      });
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
   * Calculate expected cash for a session (full-ledger CASH_ON_HAND balance as of today).
   * Uses the same 'manual' scope as opening/closing variance so cash outflows that never
   * tag openSessionId (expenses, refunds, supplier payments, reversals) are reflected.
   * Internal method - not exposed to cashiers
   */
  private async calculateExpectedCash(
    ctx: RequestContext,
    session: CashierSession
  ): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return this.ledgerQueryService.getExpectedBalanceForReconciliation(
      session.channelId,
      'manual',
      session.id,
      ACCOUNT_CODES.CASH_ON_HAND,
      today
    );
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
   * Get per-account closing balances from the last closed session for this channel.
   * Used to pre-fill opening balances for the next session.
   */
  async getLastClosedSessionClosingBalances(
    ctx: RequestContext,
    channelId: number
  ): Promise<Array<{ accountCode: string; accountName: string; balanceCents: string }>> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const lastClosed = await sessionRepo.findOne({
      where: { channelId, status: 'closed' },
      order: { closedAt: 'DESC' },
    });
    if (!lastClosed) return [];

    const details = await this.reconciliationService.getSessionReconciliationDetails(
      ctx,
      lastClosed.id,
      'closing'
    );
    return details.map(d => ({
      accountCode: d.accountCode,
      accountName: d.accountName,
      balanceCents: d.declaredAmountCents ?? '0',
    }));
  }

  /**
   * Get expected closing balances for an open session (per cashier-controlled account).
   * Expected = full-ledger balance as of today (scope 'manual'), matching what
   * postClosingVariance computes at close so the prefill never disagrees with the close.
   */
  async getExpectedClosingBalances(
    ctx: RequestContext,
    sessionId: string
  ): Promise<Array<{ accountCode: string; accountName: string; expectedBalanceCents: string }>> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);
    const session = await sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const requirements = await this.getChannelReconciliationRequirements(ctx, session.channelId);
    const today = new Date().toISOString().slice(0, 10);
    const results: Array<{
      accountCode: string;
      accountName: string;
      expectedBalanceCents: string;
    }> = [];

    for (const pm of requirements.paymentMethods) {
      const expected = await this.ledgerQueryService.getExpectedBalanceForReconciliation(
        session.channelId,
        'manual',
        sessionId,
        pm.ledgerAccountCode,
        today
      );
      results.push({
        accountCode: pm.ledgerAccountCode,
        accountName: pm.paymentMethodName || pm.paymentMethodCode,
        expectedBalanceCents: String(expected),
      });
    }
    return results;
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
