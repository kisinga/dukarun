import { graphql } from '../../shared/graphql/generated';

export const GET_CHANNEL_RECONCILIATION_CONFIG = graphql(`
  query GetChannelReconciliationConfig($channelId: Int!) {
    channelReconciliationConfig(channelId: $channelId) {
      paymentMethodId
      paymentMethodCode
      reconciliationType
      ledgerAccountCode
      isCashierControlled
      requiresReconciliation
    }
  }
`);

export const GET_SHIFT_MODAL_PREFILL_DATA = graphql(`
  query GetShiftModalPrefillData($channelId: Int!) {
    shiftModalPrefillData(channelId: $channelId) {
      config {
        paymentMethodId
        paymentMethodCode
        reconciliationType
        ledgerAccountCode
        isCashierControlled
        requiresReconciliation
      }
      balances {
        accountCode
        accountName
        balanceCents
      }
    }
  }
`);

export const GET_CURRENT_CASHIER_SESSION = graphql(`
  query GetCurrentCashierSession($channelId: Int!) {
    currentCashierSession(channelId: $channelId) {
      id
      channelId
      cashierUserId
      openedAt
      closedAt
      closingDeclared
      status
    }
  }
`);

export const GET_CASHIER_SESSION = graphql(`
  query GetCashierSession($sessionId: String!) {
    cashierSession(sessionId: $sessionId) {
      sessionId
      cashierUserId
      openedAt
      closedAt
      status
      openingFloat
      closingDeclared
      ledgerTotals {
        cashTotal
        mpesaTotal
        totalCollected
      }
      variance
    }
  }
`);

export const GET_CASHIER_SESSIONS = graphql(`
  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {
    cashierSessions(channelId: $channelId, options: $options) {
      items {
        id
        channelId
        cashierUserId
        openedAt
        closedAt
        closingDeclared
        status
      }
      totalItems
    }
  }
`);

export const OPEN_CASHIER_SESSION = graphql(`
  mutation OpenCashierSession($input: OpenCashierSessionInput!) {
    openCashierSession(input: $input) {
      id
      channelId
      cashierUserId
      openedAt
      status
    }
  }
`);

export const CLOSE_CASHIER_SESSION = graphql(`
  mutation CloseCashierSession($input: CloseCashierSessionInput!) {
    closeCashierSession(input: $input) {
      sessionId
      cashierUserId
      openedAt
      closedAt
      status
      openingFloat
      closingDeclared
      ledgerTotals {
        cashTotal
        mpesaTotal
        totalCollected
      }
      variance
    }
  }
`);

export const CREATE_CASHIER_SESSION_RECONCILIATION = graphql(`
  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {
    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {
      id
      channelId
      scope
      scopeRefId
      snapshotAt
      status
      expectedBalance
      actualBalance
      varianceAmount
      notes
      createdBy
    }
  }
`);

export const CREATE_RECONCILIATION = graphql(`
  mutation CreateReconciliation($input: CreateReconciliationInput!) {
    createReconciliation(input: $input) {
      id
      channelId
      scope
      scopeRefId
      snapshotAt
      status
      expectedBalance
      actualBalance
      varianceAmount
      notes
      createdBy
    }
  }
`);

export const GET_RECONCILIATIONS = graphql(`
  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {
    reconciliations(channelId: $channelId, options: $options) {
      items {
        id
        channelId
        scope
        scopeRefId
        snapshotAt
        status
        expectedBalance
        actualBalance
        varianceAmount
        notes
        createdBy
      }
      totalItems
    }
  }
`);

export const GET_RECONCILIATION_DETAILS = graphql(`
  query GetReconciliationDetails($reconciliationId: String!) {
    reconciliationDetails(reconciliationId: $reconciliationId) {
      accountId
      accountCode
      accountName
      declaredAmountCents
      expectedBalanceCents
      varianceCents
    }
  }
`);

export const GET_SESSION_RECONCILIATION_DETAILS = graphql(`
  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {
    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {
      accountId
      accountCode
      accountName
      declaredAmountCents
      expectedBalanceCents
      varianceCents
    }
  }
`);

export const GET_ACCOUNT_BALANCES_AS_OF = graphql(`
  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {
    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {
      accountId
      accountCode
      accountName
      balanceCents
    }
  }
`);

export const GET_LAST_CLOSED_SESSION_CLOSING_BALANCES = graphql(`
  query GetLastClosedSessionClosingBalances($channelId: Int!) {
    lastClosedSessionClosingBalances(channelId: $channelId) {
      accountCode
      accountName
      balanceCents
    }
  }
`);

export const GET_EXPECTED_SESSION_CLOSING_BALANCES = graphql(`
  query GetExpectedSessionClosingBalances($sessionId: String!) {
    expectedSessionClosingBalances(sessionId: $sessionId) {
      accountCode
      accountName
      expectedBalanceCents
    }
  }
`);
