import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { JournalListComponent } from './journal-list.component';
import type { JournalEntryWithLines, JournalLineWithAccount } from './money.service';

function line(
  code: string | null,
  name: string,
  debit: number,
  credit: number
): JournalLineWithAccount {
  return {
    id: String(debit) + code,
    debit,
    credit,
    ledger_accounts: code ? { code, name } : null,
  } as JournalLineWithAccount;
}
function render(context: string, source: string, lines: JournalLineWithAccount[]) {
  const fixture = TestBed.createComponent(JournalListComponent);
  fixture.componentRef.setInput('context', context);
  fixture.componentRef.setInput('entries', [
    {
      id: 'entry',
      entry_date: '2026-09-27',
      memo: 'Test memo',
      source_type: source,
      ledger_journal_lines: lines,
    } as JournalEntryWithLines,
  ]);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
describe('JournalListComponent account context', () => {
  it('shows expense account context while keeping debit/credit details collapsed', () => {
    const root = render('expense', 'Expense', [
      line('EXPENSES', 'Expenses', 500, 0),
      line('CASH', 'Till', 0, 500),
    ]);
    expect(root.textContent).toContain('Paid from: Till');
    expect(root.textContent).toContain('500');
    expect(root.querySelector('details')!.open).toBe(false);
  });
  it('shows transfer direction from the posted credit to debit account', () => {
    const root = render('transfer', 'InterAccountTransfer', [
      line('BANK', 'Bank', 500, 0),
      line('CASH', 'Till', 0, 500),
    ]);
    expect(root.textContent).toContain('From Till → To Bank');
  });
  it('does not call purchase-generated expenses paid or reinterpret compound entries', () => {
    const root = render('expense', 'PurchaseExpense', [
      line('EXPENSES', 'Expenses', 500, 0),
      line('AP', 'Accounts payable', 0, 500),
    ]);
    expect(root.textContent).toContain('Accounts: Expenses · Accounts payable');
    expect(root.textContent).not.toContain('Paid from');
    const compound = render('transfer', 'InterAccountTransfer', [
      line('BANK', 'Bank', 500, 0),
      line('CASH', 'Till', 0, 300),
      line('MPESA', 'Mobile money', 0, 200),
    ]);
    expect(compound.textContent).toContain('Accounts: Bank · Till · Mobile money');
    const splitExpense = render('expense', 'Expense', [
      line('EXPENSES', 'Expenses', 400, 0),
      line('TAX', 'Tax', 100, 0),
      line('CASH', 'Till', 0, 500),
    ]);
    expect(splitExpense.textContent).toContain('Accounts: Expenses · Tax · Till');
    expect(splitExpense.textContent).not.toContain('Paid from');
  });
  it('uses codes or an explicit missing-account state without inventing direction', () => {
    const root = render('transfer', 'InterAccountTransfer', [
      line('BANK', '', 500, 0),
      line(null, '', 0, 500),
    ]);
    expect(root.textContent).toContain('Accounts: BANK · Unknown account');
    expect(root.textContent).not.toContain('From ');
  });
});
