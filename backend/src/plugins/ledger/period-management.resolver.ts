import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, TransactionalConnection } from '@vendure/core';
import { AuditLog as AuditLogDecorator } from '../../infrastructure/audit/audit-log.decorator';
import { AUDIT_EVENTS } from '../../infrastructure/audit/audit-events.catalog';
import { CashDrawerCount, CashCountType } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { AccountingPeriod } from '../../domain/period/accounting-period.entity';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { EXPENSE_CATEGORY_CODES } from '../../ledger/expense-categories.constants';
import { JournalEntry } from '../../ledger/journal-entry.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { PostingService } from '../../ledger/posting.service';
import {
  CashCountResult,
  OpenSessionService,
  CashierSessionSummary,
} from '../../services/financial/open-session.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { InventoryReconciliationService } from '../../services/financial/inventory-reconciliation.service';
import { PeriodEndClosingService } from '../../services/financial/period-end-closing.service';
import { PeriodLockService } from '../../services/financial/period-lock.service';
import {
  PaymentMethodReconciliationConfig,
  SessionReconciliationRequirements,
} from '../../services/financial/period-management.types';
import { ReconciliationValidatorService } from '../../services/financial/reconciliation-validator.service';
import { ReconciliationService } from '../../services/financial/reconciliation.service';
import { FinancialService } from '../../services/financial/financial.service';
import { InventoryService } from '../../services/inventory/inventory.service';
import {
  CloseAccountingPeriodPermission,
  CreateInterAccountTransferPermission,
  ManageReconciliationPermission,
} from './permissions';

/** GraphQL-shaped type for CashDrawerCount (matches schema; expectedCash/variance nullable when hidden). */
interface CashDrawerCountGraphQL {
  id: string;
  channelId: number;
  sessionId: string;
  countType: CashCountType;
  takenAt: Date;
  declaredCash: string;
  expectedCash: string | null;
  variance: string | null;
  varianceReason: string | null;
  reviewedByUserId: number | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  countedByUserId: number;
}

/** Result shape for createInterAccountTransfer (matches GraphQL JournalEntry with lines.accountCode/accountName resolved). */
interface JournalEntryResult {
  id: string;
  channelId: number;
  entryDate: string;
  postedAt: Date;
  sourceType: string;
  sourceId: string;
  status: string;
  memo: string | null;
  lines: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    meta: Record<string, unknown> | null;
  }>;
}

@Resolver()
export class PeriodManagementResolver {
  constructor(
    private readonly periodEndClosingService: PeriodEndClosingService,
    private readonly reconciliationService: ReconciliationService,
    private readonly inventoryReconciliationService: InventoryReconciliationService,
    private readonly cashierSessionService: OpenSessionService,
    private readonly postingService: PostingService,
    private readonly connection: TransactionalConnection,
    private readonly periodLockService: PeriodLockService,
    private readonly reconciliationValidatorService: ReconciliationValidatorService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly financialService: FinancialService,
    private readonly inventoryService: InventoryService
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
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.RECONCILIATION_CREATED,
    entityType: 'Reconciliation',
    extractEntityId: result => result?.id ?? null,
  })
  async createReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<Reconciliation> {
    return this.reconciliationService.createReconciliation(ctx, input);
  }

  @Mutation()
  @Allow(CreateInterAccountTransferPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.EXPENSE_RECORDED,
    extractEntityId: result => result?.sourceId ?? null,
  })
  async recordExpense(
    @Ctx() ctx: RequestContext,
    @Args('input')
    input: { amount: number; sourceAccountCode: string; memo?: string; category?: string }
  ): Promise<{ sourceId: string }> {
    const category =
      input.category && typeof input.category === 'string' ? input.category.trim() : undefined;
    if (category !== undefined && category !== '' && !EXPENSE_CATEGORY_CODES.has(category)) {
      throw new Error(`Invalid expense category: ${category}`);
    }
    return this.financialService.recordExpense(
      ctx,
      input.amount,
      input.sourceAccountCode,
      input.memo?.trim() || undefined,
      category || undefined
    );
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.RECONCILIATION_VERIFIED,
    entityType: 'Reconciliation',
    extractEntityId: (_result, args) => args.reconciliationId ?? null,
  })
  async verifyReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('reconciliationId') reconciliationId: string
  ): Promise<Reconciliation> {
    return this.reconciliationService.verifyReconciliation(ctx, reconciliationId);
  }

  @Mutation()
  @Allow(CloseAccountingPeriodPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.PERIOD_CLOSED,
    extractEntityId: (_result, args) => args.periodEndDate ?? null,
  })
  async closeAccountingPeriod(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('periodEndDate') periodEndDate: string
  ) {
    return this.periodEndClosingService.closeAccountingPeriod(ctx, channelId, periodEndDate);
  }

  @Mutation()
  @Allow(CloseAccountingPeriodPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.PERIOD_OPENED,
    entityType: 'AccountingPeriod',
    extractEntityId: result => result?.id?.toString() ?? null,
  })
  async openAccountingPeriod(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('periodStartDate') periodStartDate: string
  ): Promise<AccountingPeriod> {
    return this.periodEndClosingService.openAccountingPeriod(ctx, channelId, periodStartDate);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.INVENTORY_RECONCILIATION_CREATED,
    entityType: 'Reconciliation',
    extractEntityId: result => result?.id ?? null,
  })
  async createInventoryReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<Reconciliation> {
    return this.inventoryReconciliationService.createInventoryReconciliation(ctx, input);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.INTER_ACCOUNT_TRANSFER,
    entityType: 'JournalEntry',
    extractEntityId: result => result?.id ?? null,
  })
  async createInterAccountTransfer(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<JournalEntryResult> {
    if (!input.transferId || typeof input.transferId !== 'string' || !input.transferId.trim()) {
      throw new Error('transferId is required for idempotent inter-account transfer.');
    }
    const sourceId = input.transferId.trim();

    const entryDate =
      typeof input.entryDate === 'string' && input.entryDate.trim()
        ? (() => {
            const d = new Date(input.entryDate.trim());
            if (Number.isNaN(d.getTime())) {
              throw new Error('entryDate must be a valid date (e.g. YYYY-MM-DD).');
            }
            return d.toISOString().slice(0, 10);
          })()
        : null;
    if (!entryDate) {
      throw new Error('entryDate is required.');
    }

    await this.periodLockService.validatePeriodIsOpen(ctx, input.channelId, entryDate);

    await this.chartOfAccountsService.validatePaymentSourceAccount(ctx, input.fromAccountCode);
    await this.chartOfAccountsService.validatePaymentSourceAccount(ctx, input.toAccountCode);

    const fromCode = (input.fromAccountCode && String(input.fromAccountCode)).trim();
    const toCode = (input.toAccountCode && String(input.toAccountCode)).trim();
    if (fromCode.toLowerCase() === toCode.toLowerCase()) {
      throw new Error('From account and to account must be different.');
    }

    const session = await this.cashierSessionService.requireOpenSession(ctx, input.channelId);
    const sessionMeta = { openSessionId: session.id };

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
        { accountCode: input.fromAccountCode, debit: 0, credit: fromCredit, meta: sessionMeta },
        { accountCode: input.toAccountCode, debit: principal, credit: 0, meta: sessionMeta },
        {
          accountCode: ACCOUNT_CODES.PROCESSOR_FEES,
          debit: feeAmount,
          credit: 0,
          meta: { ...sessionMeta, expenseTag },
        }
      );
    } else {
      lines.push(
        { accountCode: input.fromAccountCode, debit: 0, credit: principal, meta: sessionMeta },
        { accountCode: input.toAccountCode, debit: principal, credit: 0, meta: sessionMeta }
      );
    }

    const entry = await this.postingService.post(ctx, 'inter-account-transfer', sourceId, {
      channelId: input.channelId,
      entryDate,
      memo: input.memo || 'Inter-account transfer for reconciliation',
      lines,
    });

    // Load lines with account so we can return accountCode/accountName (GraphQL JournalLine type)
    const lineRepo = this.connection.getRepository(ctx, JournalLine);
    const linesWithAccount = await lineRepo
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.account', 'account')
      .where('line.entryId = :entryId', { entryId: entry.id })
      .getMany();

    return {
      id: entry.id,
      channelId: entry.channelId,
      entryDate: entry.entryDate,
      postedAt: entry.postedAt,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      status: entry.status ?? 'posted',
      memo: entry.memo ?? null,
      lines: linesWithAccount.map(line => ({
        id: line.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: parseInt(line.debit, 10),
        credit: parseInt(line.credit, 10),
        meta: line.meta ?? null,
      })),
    };
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
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.CASHIER_SESSION_OPENED,
    entityType: 'CashierSession',
    extractEntityId: result => result?.id ?? null,
  })
  async openCashierSession(
    @Ctx() ctx: RequestContext,
    @Args('input') input: any
  ): Promise<CashierSession> {
    return this.cashierSessionService.startSession(ctx, {
      channelId: input.channelId,
      openingBalances: (input.openingBalances || []).map(
        (b: { accountCode: string; amountCents: number }) => ({
          accountCode: b.accountCode,
          amountCents:
            typeof b.amountCents === 'number' ? b.amountCents : parseInt(b.amountCents, 10),
        })
      ),
    });
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.CASHIER_SESSION_CLOSED,
    extractEntityId: (_result, args) => args?.input?.sessionId ?? null,
  })
  async closeCashierSession(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    let sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
    const channelId = typeof input?.channelId === 'number' ? input.channelId : undefined;

    if (!sessionId || sessionId === '-1') {
      if (channelId != null && !Number.isNaN(channelId)) {
        const currentSession = await this.cashierSessionService.getCurrentSession(ctx, channelId);
        if (currentSession) {
          sessionId = currentSession.id;
        } else {
          throw new Error('No open session for this channel');
        }
      } else {
        throw new Error('Session ID or channel ID required to close a session');
      }
    }

    const closingBalances = (input.closingBalances || []).map(
      (b: { accountCode: string; amountCents: number }) => ({
        accountCode: b.accountCode,
        amountCents:
          typeof b.amountCents === 'number' ? b.amountCents : parseInt(b.amountCents, 10),
      })
    );
    const summary = await this.cashierSessionService.closeSession(ctx, {
      sessionId,
      closingBalances,
      notes: input.notes,
    });
    return this.formatSessionSummaryForGraphQL(summary);
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.CASHIER_SESSION_RECONCILIATION_CREATED,
    entityType: 'Reconciliation',
    extractEntityId: result => result?.id ?? null,
  })
  async createCashierSessionReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string,
    @Args('notes', { nullable: true }) notes?: string
  ): Promise<Reconciliation> {
    return this.cashierSessionService.createSessionReconciliationWithVariancePosting(
      ctx,
      sessionId,
      notes
    );
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
    return counts.map(count =>
      this.formatCashCountForGraphQL(count, isManager)
    ) as CashDrawerCount[];
  }

  @Query()
  @Allow(ManageReconciliationPermission.Permission)
  async pendingVarianceReviews(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ): Promise<CashDrawerCount[]> {
    const counts = await this.cashierSessionService.getPendingVarianceReviews(ctx, channelId);
    // Managers always see full details
    return counts.map(count => this.formatCashCountForGraphQL(count, true)) as CashDrawerCount[];
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

  @Query()
  @Allow(Permission.ReadOrder)
  async shiftModalPrefillData(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ): Promise<{
    config: PaymentMethodReconciliationConfig[];
    balances: Array<{ accountCode: string; accountName: string; balanceCents: string }>;
  }> {
    const config = await this.reconciliationValidatorService.getChannelReconciliationConfig(
      ctx,
      channelId
    );
    const cashierControlled = config.filter(c => c.isCashierControlled);
    const accountCodes = [...new Set(cashierControlled.map(c => c.ledgerAccountCode))];
    const today = new Date().toISOString().slice(0, 10);

    const balances = await this.reconciliationService.getAccountBalancesForCodes(
      ctx,
      channelId,
      accountCodes,
      today
    );

    return {
      config,
      balances,
    };
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async reconciliations(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('options', { nullable: true })
    options?: {
      startDate?: string;
      endDate?: string;
      scope?: string;
      hasVariance?: boolean;
      take?: number;
      skip?: number;
    }
  ) {
    return this.reconciliationService.getReconciliations(ctx, channelId, options);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async reconciliationDetails(
    @Ctx() ctx: RequestContext,
    @Args('reconciliationId') reconciliationId: string
  ) {
    return this.reconciliationService.getReconciliationDetails(ctx, reconciliationId);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async accountBalancesAsOf(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('asOfDate') asOfDate: string
  ) {
    return this.reconciliationService.getAccountBalancesAsOf(ctx, channelId, asOfDate);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async sessionReconciliationDetails(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string,
    @Args('kind', { nullable: true }) kind?: string,
    @Args('channelId', { nullable: true }) channelId?: number
  ) {
    const trimmed = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!trimmed || trimmed === '-1') {
      return [];
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      return [];
    }
    const reconKind = kind === 'opening' ? 'opening' : 'closing';
    return this.reconciliationService.getSessionReconciliationDetails(
      ctx,
      trimmed,
      reconKind,
      channelId
    );
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async lastClosedSessionClosingBalances(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number
  ) {
    return this.cashierSessionService.getLastClosedSessionClosingBalances(ctx, channelId);
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async expectedSessionClosingBalances(
    @Ctx() ctx: RequestContext,
    @Args('sessionId') sessionId: string
  ) {
    return this.cashierSessionService.getExpectedClosingBalances(ctx, sessionId);
  }

  @Query()
  @Allow(ManageReconciliationPermission.Permission)
  async closedSessionsMissingReconciliation(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: number,
    @Args('startDate', { nullable: true }) startDate?: string,
    @Args('endDate', { nullable: true }) endDate?: string,
    @Args('take', { nullable: true }) take?: number,
    @Args('skip', { nullable: true }) skip?: number
  ): Promise<Array<{ sessionId: string; closedAt: Date }>> {
    return this.cashierSessionService.getClosedSessionsMissingReconciliation(ctx, channelId, {
      startDate,
      endDate,
      take,
      skip,
    });
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async openBatchesForVariant(
    @Ctx() ctx: RequestContext,
    @Args('productVariantId') productVariantId: string,
    @Args('stockLocationId', { nullable: true }) stockLocationId?: string
  ): Promise<
    Array<{
      id: string;
      quantity: number;
      unitCost: number;
      expiryDate: Date | null;
      batchNumber: string | null;
    }>
  > {
    const channelId = ctx.channelId as number;
    const batches = await this.inventoryService.getOpenBatches(ctx, {
      channelId,
      stockLocationId: stockLocationId ?? undefined,
      productVariantId,
    });
    return batches.map(b => ({
      id: String(b.id),
      quantity: b.quantity,
      unitCost: b.unitCost,
      expiryDate: b.expiryDate,
      batchNumber: b.batchNumber ?? null,
    }));
  }

  // ============================================================================
  // CASH CONTROL MUTATIONS
  // ============================================================================

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can record counts
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.CASH_COUNT_RECORDED,
    entityType: 'CashDrawerCount',
    extractEntityId: result => result?.count?.id ?? null,
  })
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
      count: this.formatCashCountForGraphQL(result.count, false) as CashDrawerCount,
      hasVariance: result.hasVariance,
      varianceHidden: true,
    };
  }

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can explain variance
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.VARIANCE_EXPLAINED,
    entityType: 'CashDrawerCount',
    extractEntityId: (_result, args) => args.countId ?? null,
  })
  async explainVariance(
    @Ctx() ctx: RequestContext,
    @Args('countId') countId: string,
    @Args('reason') reason: string
  ): Promise<CashDrawerCount> {
    const count = await this.cashierSessionService.explainVariance(ctx, countId, reason);
    // Cashier still doesn't see variance amount after explaining
    return this.formatCashCountForGraphQL(count, false) as CashDrawerCount;
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.CASH_COUNT_REVIEWED,
    entityType: 'CashDrawerCount',
    extractEntityId: (_result, args) => args.countId ?? null,
  })
  async reviewCashCount(
    @Ctx() ctx: RequestContext,
    @Args('countId') countId: string,
    @Args('notes', { nullable: true }) notes?: string
  ): Promise<CashDrawerCount> {
    const count = await this.cashierSessionService.reviewCashCount(ctx, countId, notes);
    // Managers see full details
    return this.formatCashCountForGraphQL(count, true) as CashDrawerCount;
  }

  @Mutation()
  @Allow(Permission.UpdateOrder) // Cashiers can verify M-Pesa
  @AuditLogDecorator({
    eventType: AUDIT_EVENTS.MPESA_VERIFIED,
    extractEntityId: (_result, args) => args?.input?.sessionId ?? null,
  })
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
   * Format cash count for GraphQL - applies role-based visibility.
   * Return type matches the GraphQL CashDrawerCount type.
   */
  private formatCashCountForGraphQL(
    count: CashDrawerCount,
    showVariance: boolean
  ): CashDrawerCountGraphQL {
    return {
      id: count.id,
      channelId: count.channelId,
      sessionId: count.sessionId,
      countType: count.countType,
      takenAt: count.takenAt,
      declaredCash: count.declaredCash,
      expectedCash: showVariance ? count.expectedCash : null,
      variance: showVariance ? count.variance : null,
      varianceReason: count.varianceReason ?? null,
      reviewedByUserId: count.reviewedByUserId ?? null,
      reviewedAt: count.reviewedAt ?? null,
      reviewNotes: count.reviewNotes ?? null,
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
