import { graphql } from '../../shared/graphql/generated';

export const GET_SESSION_CASH_COUNTS = graphql(`
  query GetSessionCashCounts($sessionId: String!) {
    sessionCashCounts(sessionId: $sessionId) {
      id
      channelId
      sessionId
      countType
      takenAt
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      reviewNotes
      countedByUserId
    }
  }
`);

export const GET_PENDING_VARIANCE_REVIEWS = graphql(`
  query GetPendingVarianceReviews($channelId: Int!) {
    pendingVarianceReviews(channelId: $channelId) {
      id
      channelId
      sessionId
      countType
      takenAt
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      countedByUserId
    }
  }
`);

export const GET_SESSION_MPESA_VERIFICATIONS = graphql(`
  query GetSessionMpesaVerifications($sessionId: String!) {
    sessionMpesaVerifications(sessionId: $sessionId) {
      id
      channelId
      sessionId
      verifiedAt
      transactionCount
      allConfirmed
      flaggedTransactionIds
      notes
      verifiedByUserId
    }
  }
`);

export const RECORD_CASH_COUNT = graphql(`
  mutation RecordCashCount($input: RecordCashCountInput!) {
    recordCashCount(input: $input) {
      count {
        id
        sessionId
        countType
        takenAt
        declaredCash
        varianceReason
        countedByUserId
      }
      hasVariance
      varianceHidden
    }
  }
`);

export const EXPLAIN_VARIANCE = graphql(`
  mutation ExplainVariance($countId: String!, $reason: String!) {
    explainVariance(countId: $countId, reason: $reason) {
      id
      varianceReason
    }
  }
`);

export const REVIEW_CASH_COUNT = graphql(`
  mutation ReviewCashCount($countId: String!, $notes: String) {
    reviewCashCount(countId: $countId, notes: $notes) {
      id
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      reviewNotes
    }
  }
`);

export const VERIFY_MPESA_TRANSACTIONS = graphql(`
  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {
    verifyMpesaTransactions(input: $input) {
      id
      sessionId
      verifiedAt
      transactionCount
      allConfirmed
      flaggedTransactionIds
      notes
    }
  }
`);

