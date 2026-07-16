import { graphql } from '../../shared/graphql/generated';

export const GET_LEDGER_ACCOUNTS = graphql(`
  query GetLedgerAccounts {
    ledgerAccounts {
      items {
        id
        code
        name
        type
        isActive
        balance
        parentAccountId
        isParent
      }
    }
  }
`);

export const GET_ELIGIBLE_DEBIT_ACCOUNTS = graphql(`
  query GetEligibleDebitAccounts {
    eligibleDebitAccounts {
      items {
        id
        code
        name
        type
        isActive
        balance
        parentAccountId
        isParent
      }
    }
  }
`);

export const CREATE_INTER_ACCOUNT_TRANSFER = graphql(`
  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {
    createInterAccountTransfer(input: $input) {
      id
      entryDate
      postedAt
      sourceType
      sourceId
      memo
      lines {
        id
        accountCode
        accountName
        debit
        credit
        meta
      }
    }
  }
`);

export const GET_JOURNAL_ENTRIES = graphql(`
  query GetJournalEntries($options: JournalEntriesOptions) {
    journalEntries(options: $options) {
      items {
        id
        entryDate
        postedAt
        sourceType
        sourceId
        memo
        lines {
          id
          accountCode
          accountName
          debit
          credit
          meta
        }
      }
      totalItems
    }
  }
`);

export const GET_JOURNAL_ENTRY = graphql(`
  query GetJournalEntry($id: ID!) {
    journalEntry(id: $id) {
      id
      entryDate
      postedAt
      sourceType
      sourceId
      memo
      lines {
        id
        accountCode
        accountName
        debit
        credit
        meta
      }
    }
  }
`);
