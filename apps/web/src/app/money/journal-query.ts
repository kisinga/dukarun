export interface JournalAccountFilters {
  requiredAccountCode?: string;
  accountCode?: string;
}

const JOURNAL_LINES_BY_ENTRY = 'ledger_journal_lines!entry_id';

/**
 * Build the PostgREST embed used for journal rows and account filters.
 *
 * `ledger_journal_lines` has both a single-column and a composite foreign key
 * to journal entries. Every embed must retain the `entry_id` hint or PostgREST
 * responds with 300 Multiple Choices.
 */
export function journalPageSelect(input: JournalAccountFilters): string {
  const filters = [
    ...(input.requiredAccountCode
      ? [`required_filter:${JOURNAL_LINES_BY_ENTRY}!inner(ledger_accounts!inner(code))`]
      : []),
    ...(input.accountCode
      ? [`account_filter:${JOURNAL_LINES_BY_ENTRY}!inner(ledger_accounts!inner(code))`]
      : []),
  ];
  return `*, ${filters.length ? filters.join(', ') + ', ' : ''}${JOURNAL_LINES_BY_ENTRY}(*, ledger_accounts(code, name))`;
}
