import { gql } from 'graphql-tag';

export const LEDGER_DIVERGENCE_SCHEMA = gql`
  type LedgerDivergenceItem {
    entityType: String!
    entityId: ID!
    descriptor: String!
    entityValue: Int!
    ledgerValue: Int!
    difference: Int!
  }

  type LedgerDivergenceSummary {
    totalDivergences: Int!
    byEntityType: [LedgerDivergenceCount!]!
    items: [LedgerDivergenceItem!]!
  }

  type LedgerDivergenceCount {
    entityType: String!
    count: Int!
  }

  extend type Query {
    ledgerDivergences(toleranceCents: Int): LedgerDivergenceSummary!
  }
`;
