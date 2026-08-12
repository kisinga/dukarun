import { describe, expect, it } from 'vitest';
import { journalPageSelect } from './journal-query';

const hintedEntryRelation = 'ledger_journal_lines!entry_id';

describe('journal page query', () => {
  it('disambiguates filtered entry relationships', () => {
    const select = journalPageSelect({
      requiredAccountCode: 'EXPENSES',
      accountCode: 'CASH_ON_HAND',
    });

    expect(select).toMatch(new RegExp(`required_filter:${hintedEntryRelation}!inner`));
    expect(select).toMatch(new RegExp(`account_filter:${hintedEntryRelation}!inner`));
    expect(select).toMatch(new RegExp(`${hintedEntryRelation}\\(\\*, ledger_accounts`));
    expect(select).not.toMatch(/ledger_journal_lines!inner/);
  });

  it('uses the same explicit relationship when unfiltered', () => {
    expect(journalPageSelect({})).toBe(
      '*, ledger_journal_lines!entry_id(*, ledger_accounts(code, name))'
    );
  });
});
