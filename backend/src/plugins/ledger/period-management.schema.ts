import { gql } from 'graphql-tag';

/** Session and other UUID-bearing ids use String! not ID! so Vendure's integer ID strategy does not decode them to -1. See docs/GRAPHQL_IDS_AND_UUIDS.md */

export const PERIOD_MANAGEMENT_SCHEMA = gql`
  type AccountingPeriod {
    id: ID!
    channelId: Int!
    startDate: DateTime!
    endDate: DateTime!
    status: String!
    closedBy: Int
    closedAt: DateTime
  }

  type PeriodStatus {
    currentPeriod: AccountingPeriod
    isLocked: Boolean!
    lockEndDate: DateTime
    canClose: Boolean!
    missingReconciliations: [String!]!
  }

  type ReconciliationStatus {
    periodEndDate: DateTime!
    scopes: [ScopeReconciliationStatus!]!
  }

  type ScopeReconciliationStatus {
    scope: String!
    scopeRefId: String!
    status: String!
    varianceAmount: String
    displayName: String
  }

  type CashierSession {
    id: ID!
    channelId: Int!
    cashierUserId: Int!
    openedAt: DateTime!
    closedAt: DateTime
    closingDeclared: String!
    status: String!
  }

  type CashierSessionLedgerTotals {
    cashTotal: String!
    mpesaTotal: String!
    totalCollected: String!
  }

  type CashierSessionSummary {
    sessionId: String!
    cashierUserId: Int!
    openedAt: DateTime!
    closedAt: DateTime
    status: String!
    openingFloat: String!
    closingDeclared: String!
    ledgerTotals: CashierSessionLedgerTotals!
    variance: String!
  }

  type CashierSessionList {
    items: [CashierSession!]!
    totalItems: Int!
  }

  type ClosedSessionMissingReconciliation {
    sessionId: String!
    closedAt: DateTime!
  }

  input AccountAmountInput {
    accountCode: String!
    amountCents: Int!
  }

  input OpenCashierSessionInput {
    channelId: Int!
    openingBalances: [AccountAmountInput!]!
  }

  input CloseCashierSessionInput {
    sessionId: String!
    channelId: Int
    closingBalances: [AccountAmountInput!]!
    notes: String
  }

  input CashierSessionListOptions {
    status: String
    startDate: DateTime
    endDate: DateTime
    take: Int
    skip: Int
  }

  # Cash Control Types
  type CashDrawerCount {
    id: ID!
    channelId: Int!
    sessionId: String!
    countType: String!
    takenAt: DateTime!
    declaredCash: String!
    # These fields are only populated for managers or after review
    expectedCash: String
    variance: String
    varianceReason: String
    reviewedByUserId: Int
    reviewedAt: DateTime
    reviewNotes: String
    countedByUserId: Int!
  }

  type CashCountResult {
    count: CashDrawerCount!
    hasVariance: Boolean!
    varianceHidden: Boolean!
  }

  type MpesaVerification {
    id: ID!
    channelId: Int!
    sessionId: String!
    verifiedAt: DateTime!
    transactionCount: Int!
    allConfirmed: Boolean!
    flaggedTransactionIds: [String!]
    notes: String
    verifiedByUserId: Int!
  }

  input RecordCashCountInput {
    sessionId: String!
    declaredCash: String!
    countType: String!
  }

  input VerifyMpesaInput {
    sessionId: String!
    allConfirmed: Boolean!
    flaggedTransactionIds: [String!]
    notes: String
  }

  # Payment Method Reconciliation Configuration (driven by PM custom fields)
  type PaymentMethodReconciliationConfig {
    paymentMethodId: ID!
    paymentMethodCode: String!
    paymentMethodName: String!
    reconciliationType: String! # blind_count, transaction_verification, statement_match, none
    ledgerAccountCode: String!
    isCashierControlled: Boolean!
    requiresReconciliation: Boolean!
  }

  type SessionReconciliationRequirements {
    blindCountRequired: Boolean!
    verificationRequired: Boolean!
    paymentMethods: [PaymentMethodReconciliationConfig!]!
  }

  type PeriodEndCloseResult {
    success: Boolean!
    period: AccountingPeriod!
    reconciliationSummary: ReconciliationSummary!
  }

  type ReconciliationSummary {
    periodEndDate: DateTime!
    scopes: [ScopeReconciliationStatus!]!
  }

  type InventoryValuation {
    channelId: Int!
    stockLocationId: Int
    asOfDate: DateTime!
    totalValue: String!
    batchCount: Int!
    itemCount: Int!
  }

  """
  Open batch summary for choosing which batch to sell from (e.g. expiry / traceability).
  """
  type OpenBatchForVariant {
    id: ID!
    quantity: Float!
    unitCost: Int!
    expiryDate: DateTime
    batchNumber: String
  }

  type Reconciliation {
    id: ID!
    channelId: Int!
    scope: String!
    scopeRefId: String!
    snapshotAt: DateTime!
    status: String!
    expectedBalance: String
    actualBalance: String
    varianceAmount: String!
    notes: String
    createdBy: Int!
    reviewedBy: Int
  }

  input ReconciliationListOptions {
    startDate: DateTime
    endDate: DateTime
    scope: String
    hasVariance: Boolean
    take: Int
    skip: Int
  }

  type ReconciliationList {
    items: [Reconciliation!]!
    totalItems: Int!
  }

  type ReconciliationAccountDetail {
    accountId: ID!
    accountCode: String!
    accountName: String!
    declaredAmountCents: String
    expectedBalanceCents: String
    varianceCents: String
  }

  type AccountBalanceAsOfItem {
    accountId: ID!
    accountCode: String!
    accountName: String!
    balanceCents: String!
  }

  type LastClosingBalance {
    accountCode: String!
    accountName: String!
    balanceCents: String!
  }

  type ExpectedClosingBalance {
    accountCode: String!
    accountName: String!
    expectedBalanceCents: String!
  }

  type ShiftModalPrefillData {
    config: [PaymentMethodReconciliationConfig!]!
    balances: [LastClosingBalance!]!
  }

  input DeclaredAmountInput {
    accountCode: String!
    amountCents: String!
  }

  input CreateReconciliationInput {
    channelId: Int!
    scope: String!
    scopeRefId: String!
    expectedBalance: String
    actualBalance: String!
    notes: String
    declaredAmounts: [DeclaredAmountInput!]!
  }

  input CreateInventoryReconciliationInput {
    channelId: Int!
    periodEndDate: DateTime!
    stockLocationId: Int
    actualBalance: String!
    notes: String
  }

  input InterAccountTransferInput {
    channelId: Int!
    transferId: String! # Client-supplied id for idempotency (sourceId)
    fromAccountCode: String!
    toAccountCode: String!
    amount: String! # in smallest currency unit (principal)
    entryDate: String! # date-only YYYY-MM-DD (or ISO datetime; normalized to date)
    memo: String
    feeAmount: String # optional, in smallest currency unit (tagged expense)
    expenseTag: String # optional, e.g. "transaction_fee"; used in meta when feeAmount present
  }

  extend type Query {
    currentPeriodStatus(channelId: Int!): PeriodStatus!
    periodReconciliationStatus(channelId: Int!, periodEndDate: DateTime!): ReconciliationStatus!
    closedPeriods(channelId: Int!, limit: Int, offset: Int): [AccountingPeriod!]!
    inventoryValuation(
      channelId: Int!
      asOfDate: DateTime!
      stockLocationId: Int
    ): InventoryValuation!
    currentCashierSession(channelId: Int!): CashierSession
    cashierSession(sessionId: String!): CashierSessionSummary
    cashierSessions(channelId: Int!, options: CashierSessionListOptions): CashierSessionList!
    # Cash Control Queries
    sessionCashCounts(sessionId: String!): [CashDrawerCount!]!
    pendingVarianceReviews(channelId: Int!): [CashDrawerCount!]!
    sessionMpesaVerifications(sessionId: String!): [MpesaVerification!]!
    # Reconciliation Config Queries (driven by PaymentMethod custom fields)
    sessionReconciliationRequirements(sessionId: String!): SessionReconciliationRequirements!
    channelReconciliationConfig(channelId: Int!): [PaymentMethodReconciliationConfig!]!
    shiftModalPrefillData(channelId: Int!): ShiftModalPrefillData!
    reconciliations(channelId: Int!, options: ReconciliationListOptions): ReconciliationList!
    reconciliationDetails(reconciliationId: String!): [ReconciliationAccountDetail!]!
    sessionReconciliationDetails(
      sessionId: String!
      kind: String
      channelId: Int
    ): [ReconciliationAccountDetail!]!
    accountBalancesAsOf(channelId: Int!, asOfDate: String!): [AccountBalanceAsOfItem!]!
    lastClosedSessionClosingBalances(channelId: Int!): [LastClosingBalance!]!
    expectedSessionClosingBalances(sessionId: String!): [ExpectedClosingBalance!]!
    closedSessionsMissingReconciliation(
      channelId: Int!
      startDate: DateTime
      endDate: DateTime
      take: Int
      skip: Int
    ): [ClosedSessionMissingReconciliation!]!
    """
    Open batches for a variant (and optional location) for batch selection when recording a sale.
    """
    openBatchesForVariant(productVariantId: ID!, stockLocationId: ID): [OpenBatchForVariant!]!
  }

  input RecordExpenseInput {
    amount: Int!
    sourceAccountCode: String!
    memo: String
  }

  type RecordExpenseResult {
    sourceId: String!
  }

  extend type Mutation {
    recordExpense(input: RecordExpenseInput!): RecordExpenseResult!
    createReconciliation(input: CreateReconciliationInput!): Reconciliation!
    verifyReconciliation(reconciliationId: String!): Reconciliation!
    closeAccountingPeriod(channelId: Int!, periodEndDate: DateTime!): PeriodEndCloseResult!
    openAccountingPeriod(channelId: Int!, periodStartDate: DateTime!): AccountingPeriod!
    createInventoryReconciliation(input: CreateInventoryReconciliationInput!): Reconciliation!
    createInterAccountTransfer(input: InterAccountTransferInput!): JournalEntry!
    openCashierSession(input: OpenCashierSessionInput!): CashierSession!
    closeCashierSession(input: CloseCashierSessionInput!): CashierSessionSummary!
    createCashierSessionReconciliation(sessionId: String!, notes: String): Reconciliation!
    # Cash Control Mutations
    recordCashCount(input: RecordCashCountInput!): CashCountResult!
    explainVariance(countId: String!, reason: String!): CashDrawerCount!
    reviewCashCount(countId: String!, notes: String): CashDrawerCount!
    verifyMpesaTransactions(input: VerifyMpesaInput!): MpesaVerification!
  }
`;
