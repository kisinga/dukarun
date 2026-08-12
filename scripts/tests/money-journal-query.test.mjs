import assert from 'node:assert/strict';
import test from 'node:test';
import { journalPageSelect } from '../../apps/web/src/app/money/journal-query.ts';

const hintedEntryRelation = 'ledger_journal_lines!entry_id';

test('journal account embeds disambiguate the entry relationship', () => {
  const select = journalPageSelect({
    requiredAccountCode: 'EXPENSES',
    accountCode: 'CASH_ON_HAND',
  });

  assert.match(select, new RegExp(`required_filter:${hintedEntryRelation}!inner`));
  assert.match(select, new RegExp(`account_filter:${hintedEntryRelation}!inner`));
  assert.match(select, new RegExp(`${hintedEntryRelation}\\(\\*, ledger_accounts`));
  assert.doesNotMatch(select, /ledger_journal_lines!inner/);
});

test('unfiltered journal embeds use the same explicit relationship', () => {
  assert.equal(
    journalPageSelect({}),
    '*, ledger_journal_lines!entry_id(*, ledger_accounts(code, name))'
  );
});
