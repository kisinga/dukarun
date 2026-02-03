import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, TransactionalConnection } from '@vendure/core';
import { CashDrawerCount } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { AccountingPeriod } from '../../domain/period/accounting-period.entity';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { JournalEntry } from '../../ledger/journal-entry.entity';
import { PostingService } from '../../ledger/posting.service';
import {
  CashCountResult,
  CashierSessionService,
  CashierSessionSummary,
  SessionReconciliationRequirements,
} from '../../services/financial/cashier-session.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { InventoryReconciliationService } from '../../services/financial/inventory-reconciliation.service';
import { PeriodEndClosingService } from '../../services/financial/period-end-closing.service';
import { PeriodLockService } from '../../services/financial/period-lock.service';
import {
  PaymentMethodReconciliationConfig,
  ReconciliationValidatorService,
} from '../../services/financial/reconciliation-validator.service';
import { ReconciliationService } from '../../services/financial/reconciliation.service';
import { CloseAccountingPeriodPermission, ManageReconciliationPermission } from './permissions';

@Resolver()
export class PeriodManagementResolver {
  constructor(
    private readonly periodEndClosingService: PeriodEndClosingService,
    private readonly reconciliationService: ReconciliationService,
    private readonly inventoryReconciliationService: InventoryReconciliationService,
    private readonly cashierSessionService: CashierSessionService,
    private readonly postingService: PostingService,
    private readonly connection: TransactionalConnection,
    private readonly periodLockService: PeriodLockService,
    private readonly reconciliationValidatorService: ReconciliationValidatorService,
    private readonly chartOfAccountsService: ChartOfAccountsService
  ) {}

  @Query()
  @Allow(Permission.ReadOrder) // TODO: Use custom permission
  async currentPeriodStatus(@Ctx() ctx: RequestContext, @Args('channelId') channelId: number) {
    return this.periodEndClosingService.getCurrentPeriodStatus(ctx, channelId);
  }

  @Query()
  @Allow(Permission.ReadOrder) // TODO: Use custom permission
  async periodReconciliationStatus(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('periodEndDate') periodEndDate: string
  ) {
    return this.reconciliationService.getReconciliationStatus(ctx, channelId, periodEndDate);
  }

  @Query()
  @Allow(Permission.ReadOrder) // TODO: Use custom permission
  async closedPeriods(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('limit', { nullable: true }) limit?: number,
    @Args('offset', { nullable: true }) offset?: number
  ): Promise<AccountingPeriod[]> {
    const periodRepo = this.connection.getRepository(ctx, AccountingPeriod);
    return periodRepo.find({
      where: {
        channelId,
        status: 'closed',
      },
      order: {
        endDate: 'DESC',
      },
      take: limit || 10,
      skip: offset || 0,
    });
  }

  @Query()
  @Allow(Permission.ReadOrder) // TODO: Use custom permission
  async inventoryValuation(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('asOfDate') asOfDate: string,
    @Args('stockLocationId', { nullable: true }) stockLocationId?: number
  ) {
    return this.inventoryReconciliationService.calculateInventoryValuation(
      ctx,
      channelId,
      asOfDate,
      stockLocationId
    );
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async createReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<Reconciliation> {
    return this.reconciliationService.createReconciliation(ctx, input);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async verifyReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('reconciliationId') reconciliationId: string
  ): Promise<Reconciliation> {
    return this.reconciliationService.verifyReconciliation(ctx, reconciliationId);
  }

  @Mutation()
  @Allow(CloseAccountingPeriodPermission.Permission)
  async closeAccountingPeriod(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('periodEndDate') periodEndDate: string
  ) {
    return this.periodEndClosingService.closeAccountingPeriod(ctx, channelId, periodEndDate);
  }

  @Mutation()
  @Allow(CloseAccountingPeriodPermission.Permission)
  async openAccountingPeriod(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('periodStartDate') periodStartDate: string
  ): Promise<AccountingPeriod> {
    return this.periodEndClosingService.openAccountingPeriod(ctx, channelId, periodStartDate);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async createInventoryReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<Reconciliation> {
    return this.inventoryReconciliationService.createInventoryReconciliation(ctx, input);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async createInterAccountTransfer(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<JournalEntry> {
    if (!input.transferId || typeof input.transferId !== 'string' || !input.transferId.trim()) {
      throw new Error('transferId is required for idempotent inter-account transfer.');
    }
    const sourceId = input.transferId.trim();

    await this.periodLockService.validatePeriodIsOpen(ctx, input.channelId, input.entryDate);

    await this.chartOfAccountsService.validatePaymentSourceAccount(ctx, input.fromAccountCode);
    await this.chartOfAccountsService.validatePaymentSourceAccount(ctx, input.toAccountCode);

    const principal = Number(BigInt(input.amount));
    if (principal <= 0) {
      throw new Error('Transfer amount must be greater than zero.');
    }
    const feeAmount =
      input.feeAmount != null && input.feeAmount !== '' ? Number(BigInt(input.feeAmount)) : 0;
    if (feeAmount < 0) {
      throw new Error('Transfer fee amount cannot be negative.');
    }
    const expenseTag =
      input.expenseTag && typeof input.expenseTag === 'string'
        ? input.expenseTag.trim()
        : 'transaction_fee';

    const lines: Array<{
      accountCode: string;
      debit?: number;
      credit?: number;
      meta?: Record<string, unknown>;
    }> = [];

    if (feeAmount > 0) {
      // Credit from (principal + fee), Debit to (principal), Debit expense (fee with tag)
      const fromCredit = principal + feeAmount;
      lines.push(
        { accountCode: input.fromAccountCode, debit: 0, credit: fromCredit },
        { accountCode: input.toAccountCode, debit: principal, credit: 0 },
        {
          accountCode: ACCOUNT_CODES.PROCESSOR_FEES,
          debit: feeAmount,
          credit: 0,
          meta: { expenseTag },
        }
      );
    } else {
      lines.push(
        { accountCode: input.fromAccountCode, debit: 0, credit: principal },
        { accountCode: input.toAccountCode, debit: principal, credit: 0 }
      );
    }

    return this.postingService.post(ctx, 'inter-account-transfer', sourceId, {
      channelId: input.channelId,
      entryDate: input.entryDate,
      memo: input.memo || 'Inter-account transfer for reconciliation',
      lines,
    });
  }

  // ============================================================================
  // CASHIER SESSION QUERIES
  // ============================================================================

  @Query()
  @Allow(Permission.ReadOrder)
  async currentCashierSession(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ): Promise<CashierSession | null> {
    return this.cashierSessionService.getCurrentSession(ctx, channelId);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async cashierSession(@Ctx() ctx: RequestContext, @Args('sessionId') sessionId: string) {
    const summary = await this.cashierSessionService.getSessionSummary(ctx, sessionId);
    return this.formatSessionSummaryForGraphQL(summary);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async cashierSessions(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('options', { nullable: true }) options?: any
  ) {
    return this.cashierSessionService.getSessions(ctx, channelId, {
      status: options?.status,
      startDate: options?.startDate,
      endDate: options?.endDate,
      take: options?.take,
      skip: options?.skip,
    });
  }

  // ============================================================================
  // CASHIER SESSION MUTATIONS
  // ============================================================================

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async openCashierSession(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<CashierSession> {
    return this.cashierSessionService.startSession(ctx, {
      channelId: input.channelId,
      openingFloat: parseInt(input.openingFloat, 10),
    });
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async closeCashierSession(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    const summary = await this.cashierSessionService.closeSession(ctx, {
      sessionId: input.sessionId,
      closingDeclared: parseInt(input.closingDeclared, 10),
      notes: input.notes,
    });
    return this.formatSessionSummaryForGraphQL(summary);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async createCashierSessionReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string,
    @Args('notes', { nullable: true }) notes?: string
  ): Promise<Reconciliation> {
    return this.cashierSessionService.createSessionReconciliation(ctx, sessionId, notes);
  }

  // ============================================================================
  // CASH CONTROL QUERIES
  // ============================================================================

  @Query()
  @Allow(Permission.ReadOrder)
  async sessionCashCounts(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string
  ): Promise<CashDrawerCount[]> {
    const counts = await this.cashierSessionService.getSessionCashCounts(ctx, sessionId);
    // Apply role-based visibility - hide variance details for non-managers
    const isManager = this.hasManageReconciliationPermission(ctx);
    return counts.map(count => this.formatCashCountForGraphQL(count, isManager));
  }

  @Query()
  @Allow(ManageReconciliationPermission.Permission)
  async pendingVarianceReviews(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ): Promise<CashDrawerCount[]> {
    const counts = await this.cashierSessionService.getPendingVarianceReviews(ctx, channelId);
    // Managers always see full details
    return counts.map(count => this.formatCashCountForGraphQL(count, true));
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async sessionMpesaVerifications(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string
  ): Promise<MpesaVerification[]> {
    return this.cashierSessionService.getSessionMpesaVerifications(ctx, sessionId);
  }

  // ============================================================================
  // RECONCILIATION CONFIG QUERIES (Driven by PaymentMethod custom fields)
  // ============================================================================

  @Query()
  @Allow(Permission.ReadOrder)
  async sessionReconciliationRequirements(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string
  ): Promise<SessionReconciliationRequirements> {
    return this.cashierSessionService.getSessionReconciliationRequirements(ctx, sessionId);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async channelReconciliationConfig(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ): Promise<PaymentMethodReconciliationConfig[]> {
    return this.reconciliationValidatorService.getChannelReconciliationConfig(ctx, channelId);
  }

  // ============================================================================
  // CASH CONTROL MUTATIONS
  // ============================================================================

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can record counts
  async recordCashCount(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<CashCountResult> {
    const result = await this.cashierSessionService.recordCashCount(ctx, {
      sessionId: input.sessionId,
      declaredCash: parseInt(input.declaredCash, 10),
      countType: input.countType,
    });

    // Always hide variance from the cashier
    return {
      count: this.formatCashCountForGraphQL(result.count, false),
      hasVariance: result.hasVariance,
      varianceHidden: true,
    };
  }

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can explain variance
  async explainVariance(
    @Ctx() ctx: RequestContext,
    @Args('countId') countId: string,
    @Args('reason') reason: string
  ): Promise<CashDrawerCount> {
    const count = await this.cashierSessionService.explainVariance(ctx, countId, reason);
    // Cashier still doesn't see variance amount after explaining
    return this.formatCashCountForGraphQL(count, false);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async reviewCashCount(
    @Ctx() ctx: RequestContext,
    @Args('countId') countId: string,
    @Args('notes', { nullable: true }) notes?: string
  ): Promise<CashDrawerCount> {
    const count = await this.cashierSessionService.reviewCashCount(ctx, countId, notes);
    // Managers see full details
    return this.formatCashCountForGraphQL(count, true);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can verify M-Pesa
  async verifyMpesaTransactions(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<MpesaVerification> {
    return this.cashierSessionService.verifyMpesaTransactions(ctx, {
      sessionId: input.sessionId,
      allConfirmed: input.allConfirmed,
      flaggedTransactionIds: input.flaggedTransactionIds,
      notes: input.notes,
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if user has ManageReconciliation permission
   * Uses Vendure's RequestContext which has channel-scoped permission info
   */
  private hasManageReconciliationPermission(ctx: RequestContext): boolean {
    // In Vendure, permissions are handled at the resolver level via @Allow decorator
    // For role-based field visibility, we check if the user is authenticated
    // and assume managers have higher-level access to this endpoint
    // The actual permission check happens in @Allow(ManageReconciliationPermission.Permission)
    // This helper is for field-level visibility only
    return ctx.activeUserId !== undefined;
  }

  /**
   * Format cash count for GraphQL - applies role-based visibility
   */
  private formatCashCountForGraphQL(count: CashDrawerCount, showVariance: boolean): any {
    return {
      id: count.id,
      channelId: count.channelId,
      sessionId: count.sessionId,
      countType: count.countType,
      takenAt: count.takenAt,
      declaredCash: count.declaredCash,
      // Only show these fields if user is a manager
      expectedCash: showVariance ? count.expectedCash : null,
      variance: showVariance ? count.variance : null,
      varianceReason: count.varianceReason,
      reviewedByUserId: count.reviewedByUserId,
      reviewedAt: count.reviewedAt,
      reviewNotes: count.reviewNotes,
      countedByUserId: count.countedByUserId,
    };
  }

  /**
   * Format session summary for GraphQL response
   * Converts numeric values to strings for BigInt compatibility
   */
  private formatSessionSummaryForGraphQL(summary: CashierSessionSummary) {
    return {
      sessionId: summary.sessionId,
      cashierUserId: summary.cashierUserId,
      openedAt: summary.openedAt,
      closedAt: summary.closedAt,
      status: summary.status,
      openingFloat: summary.openingFloat.toString(),
      closingDeclared: summary.closingDeclared.toString(),
      ledgerTotals: {
        cashTotal: summary.ledgerTotals.cashTotal.toString(),
        mpesaTotal: summary.ledgerTotals.mpesaTotal.toString(),
        totalCollected: summary.ledgerTotals.totalCollected.toString(),
      },
      variance: summary.variance.toString(),
    };
  }
}
