import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { gql } from 'graphql-tag';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { AuditCorePlugin } from '../audit/audit-core.plugin';
import { CashDrawerCount } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { MoneyEvent } from '../../domain/money/money-event.entity';
import { AccountingPeriod } from '../../domain/period/accounting-period.entity';
import { PeriodLock } from '../../domain/period/period-lock.entity';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../domain/recon/reconciliation-account.entity';
import { Account } from '../../ledger/account.entity';
import { JournalEntry } from '../../ledger/journal-entry.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { PostingService } from '../../ledger/posting.service';
import { AccountBalanceService } from '../../services/financial/account-balance.service';
import { ChannelPaymentMethodService } from '../../services/financial/channel-payment-method.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { FinancialService } from '../../services/financial/financial.service';
import { LedgerPostingService } from '../../services/financial/ledger-posting.service';
import { LedgerTransactionService } from '../../services/financial/ledger-transaction.service';
import { OpenSessionService } from '../../services/financial/open-session.service';
import { PurchasePostingStrategy } from '../../services/financial/strategies/purchase-posting.strategy';
import { SalePostingStrategy } from '../../services/financial/strategies/sale-posting.strategy';
import { InventoryReconciliationService } from '../../services/financial/inventory-reconciliation.service';
import { LedgerQueryService } from '../../services/financial/ledger-query.service';
import { AnalyticsQueryService } from '../../services/analytics/analytics-query.service';
import { PeriodEndClosingService } from '../../services/financial/period-end-closing.service';
import { PeriodLockService } from '../../services/financial/period-lock.service';
import { ReconciliationValidatorService } from '../../services/financial/reconciliation-validator.service';
import { ReconciliationService } from '../../services/financial/reconciliation.service';
import { InventoryBatch } from '../../services/inventory/entities/inventory-batch.entity';
import { InventoryMovement } from '../../services/inventory/entities/inventory-movement.entity';
import { SaleCogs } from '../../services/inventory/entities/sale-cogs.entity';
import { InventoryService } from '../../services/inventory/inventory.service';
import { InventoryStoreService } from '../../services/inventory/inventory-store.service';
import { InventoryStore } from '../../services/inventory/interfaces/inventory-store.interface';
import { DefaultExpiryPolicy } from '../../services/inventory/policies/default-expiry.policy';
import { FifoCostingStrategy } from '../../services/inventory/strategies/fifo-costing.strategy';
import { PurchasePayment } from '../../services/stock/entities/purchase-payment.entity';
import { DashboardStatsResolver } from './dashboard-stats.resolver';
import { DASHBOARD_STATS_SCHEMA } from './dashboard-stats.schema';
import { LedgerViewerResolver } from './ledger-viewer.resolver';
import { LEDGER_VIEWER_SCHEMA } from './ledger-viewer.schema';
import { ReconciliationResolver } from './reconciliation.resolver';
import { PeriodManagementResolver } from './period-management.resolver';
import { PERIOD_MANAGEMENT_SCHEMA } from './period-management.schema';
import {
  CloseAccountingPeriodPermission,
  CreateInterAccountTransferPermission,
  ManageReconciliationPermission,
} from './permissions';

// Merge schemas
const COMBINED_SCHEMA = gql`
  ${DASHBOARD_STATS_SCHEMA}
  ${LEDGER_VIEWER_SCHEMA}
  ${PERIOD_MANAGEMENT_SCHEMA}
`;

@VendurePlugin({
  imports: [PluginCommonModule, AuditCorePlugin],
  entities: [
    Account,
    JournalEntry,
    JournalLine,
    MoneyEvent,
    CashierSession,
    CashDrawerCount,
    MpesaVerification,
    Reconciliation,
    ReconciliationAccount,
    PeriodLock,
    AccountingPeriod,
    PurchasePayment,
    InventoryBatch,
    InventoryMovement,
    SaleCogs,
  ],
  providers: [
    PostingService,
    InventoryStoreService,
    { provide: 'InventoryStore', useClass: InventoryStoreService },
    FifoCostingStrategy,
    DefaultExpiryPolicy,
    InventoryService,
    ChartOfAccountsService,
    ChannelPaymentMethodService,
    DashboardStatsResolver,
    LedgerViewerResolver,
    ReconciliationResolver,
    PeriodManagementResolver,
    LedgerQueryService,
    AnalyticsQueryService,
    AccountBalanceService,
    PeriodLockService,
    ReconciliationService,
    ReconciliationValidatorService,
    InventoryReconciliationService,
    PeriodEndClosingService,
    LedgerPostingService,
    PurchasePostingStrategy,
    SalePostingStrategy,
    LedgerTransactionService,
    FinancialService,
    OpenSessionService,
  ],
  exports: [PostingService, AccountBalanceService, OpenSessionService],
  configuration: config => {
    // Register custom permissions
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions || []),
      ManageReconciliationPermission,
      CloseAccountingPeriodPermission,
      CreateInterAccountTransferPermission,
    ];
    return config;
  },
  adminApiExtensions: {
    schema: COMBINED_SCHEMA,
    resolvers: [
      DashboardStatsResolver,
      LedgerViewerResolver,
      ReconciliationResolver,
      PeriodManagementResolver,
    ],
  },
  shopApiExtensions: {
    schema: COMBINED_SCHEMA,
    resolvers: [
      DashboardStatsResolver,
      LedgerViewerResolver,
      ReconciliationResolver,
      PeriodManagementResolver,
    ],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class LedgerPlugin {}
