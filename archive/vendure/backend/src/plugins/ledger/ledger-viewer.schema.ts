import { gql } from 'graphql-tag';

export const LEDGER_VIEWER_SCHEMA = gql`
  type LedgerAccount {
    id: ID!
    code: String!
    name: String!
    type: String!
    isActive: Boolean!
    balance: Float!
    parentAccountId: ID
    isParent: Boolean!
    isSystemAccount: Boolean!
  }

  type JournalLine {
    id: ID!
    accountCode: String!
    accountName: String!
    debit: Float!
    credit: Float!
    meta: JSON
  }

  type JournalEntry {
    id: ID!
    channelId: Int!
    entryDate: String!
    postedAt: DateTime!
    sourceType: String!
    sourceId: String!
    status: String!
    memo: String
    lines: [JournalLine!]!
  }

  type LedgerAccountsResult {
    items: [LedgerAccount!]!
  }

  type JournalEntriesResult {
    items: [JournalEntry!]!
    totalItems: Int!
  }

  input JournalEntriesOptions {
    accountCode: String
    startDate: String
    endDate: String
    sourceType: String
    take: Int
    skip: Int
  }

  extend type Query {
    ledgerAccounts: LedgerAccountsResult!
    """
    Ledger accounts eligible as payment/debit sources (asset, leaf, excluding AR and inventory).
    """
    eligibleDebitAccounts: LedgerAccountsResult!
    journalEntries(options: JournalEntriesOptions): JournalEntriesResult!
    journalEntry(id: ID!): JournalEntry
  }
`;
