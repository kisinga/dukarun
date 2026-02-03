import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { gql } from 'graphql-tag';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CashDrawerCount } from '../../domain/cashier/cash-drawer-count.entity';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { MoneyEvent } from '../../domain/money/money-event.entity';
import { AccountingPeriod } from '../../domain/period/accounting-period.entity';
import { PeriodLock } from '../../domain/period/period-lock.entity';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';
import { Account } from '../../ledger/account.entity';
import { JournalEntry } from '../../ledger/journal-entry.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { PostingService } from '../../ledger/posting.service';
import { AccountBalanceService } from '../../services/financial/account-balance.service';
import { CashierSessionService } from '../../services/financial/cashier-session.service';
import { ChartOfAccountsService } from '../../services/financial/chart-of-accounts.service';
import { InventoryReconciliationService } from '../../services/financial/inventory-reconciliation.service';
import { LedgerQueryService } from '../../services/financial/ledger-query.service';
import { PeriodEndClosingService } from '../../services/financial/period-end-closing.service';
import { PeriodLockService } from '../../services/financial/period-lock.service';
import { ReconciliationValidatorService } from '../../services/financial/reconciliation-validator.service';
import { ReconciliationService } from '../../services/financial/reconciliation.service';
import { PurchasePayment } from '../../services/stock/entities/purchase-payment.entity';
import { DashboardStatsResolver } from './dashboard-stats.resolver';
import { DASHBOARD_STATS_SCHEMA } from './dashboard-stats.schema';
import { LedgerViewerResolver } from './ledger-viewer.resolver';
import { LEDGER_VIEWER_SCHEMA } from './ledger-viewer.schema';
import { PeriodManagementResolver } from './period-management.resolver';
import { PERIOD_MANAGEMENT_SCHEMA } from './period-management.schema';
import { CloseAccountingPeriodPermission, ManageReconciliationPermission } from './permissions';

// Merge schemas
const COMBINED_SCHEMA = gql`
  ${DASHBOARD_STATS_SCHEMA}
  ${LEDGER_VIEWER_SCHEMA}
  ${PERIOD_MANAGEMENT_SCHEMA}
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [
    Account,
    JournalEntry,
    JournalLine,
    MoneyEvent,
    CashierSession,
    CashDrawerCount,
    MpesaVerification,
    Reconciliation,
    PeriodLock,
    AccountingPeriod,
    PurchasePayment,
  ],
  providers: [
    PostingService,
    ChartOfAccountsService,
    DashboardStatsResolver,
    LedgerViewerResolver,
    PeriodManagementResolver,
    LedgerQueryService,
    AccountBalanceService,
    PeriodLockService,
    ReconciliationService,
    ReconciliationValidatorService,
    InventoryReconciliationService,
    PeriodEndClosingService,
    CashierSessionService,
  ],
  exports: [PostingService, AccountBalanceService, CashierSessionService],
  configuration: config => {
    // Register custom permissions
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions || []),
      ManageReconciliationPermission,
      CloseAccountingPeriodPermission,
    ];
    return config;
  },
  adminApiExtensions: {
    schema: COMBINED_SCHEMA,
    resolvers: [DashboardStatsResolver, LedgerViewerResolver, PeriodManagementResolver],
  },
  shopApiExtensions: {
    schema: COMBINED_SCHEMA,
    resolvers: [DashboardStatsResolver, LedgerViewerResolver, PeriodManagementResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class LedgerPlugin {}
