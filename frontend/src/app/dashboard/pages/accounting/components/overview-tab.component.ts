import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { LedgerAccount, JournalEntry } from '../../../../core/services/ledger/ledger.service';
import { MoneyComponent } from '../../../../core/components/money.component';
import type { AccountingContext } from '../accounting-context';
import { sourceTypeLabel } from '../utils/accounting-formatting';

interface MoneyBucket {
  label: string;
  icon: string;
  value: number;
  direction: 'in' | 'out' | null;
}

@Component({
  selector: 'app-overview-tab',
  imports: [CommonModule, NgIcon, MoneyComponent],
  templateUrl: './overview-tab.component.html',
  styleUrl: './overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTabComponent {
  context = input.required<AccountingContext>();
  sourceTypeLabel = sourceTypeLabel;

  accountSelect = output<LedgerAccount>();
  entryView = output<JournalEntry>();

  /**
   * Owner-first money buckets derived from ledger account balances by code —
   * the plain-money answer to "how much do I have / who owes whom", replacing
   * the raw chart-of-accounts list on the landing.
   */
  readonly buckets = computed<MoneyBucket[]>(() => {
    const accounts = this.context().accounts;
    const balanceOf = (code: string) => accounts.find((a) => a.code === code)?.balance ?? 0;
    return [
      { label: 'Cash', icon: 'heroBanknotes', value: balanceOf('CASH_ON_HAND'), direction: null },
      { label: 'Bank', icon: 'heroCreditCard', value: balanceOf('BANK_MAIN'), direction: null },
      {
        label: 'Owed to me',
        icon: 'heroUsers',
        value: balanceOf('ACCOUNTS_RECEIVABLE'),
        direction: 'in',
      },
      { label: 'I owe', icon: 'heroTruck', value: balanceOf('ACCOUNTS_PAYABLE'), direction: 'out' },
    ];
  });

  onAccountClick(account: LedgerAccount) {
    this.accountSelect.emit(account);
  }

  onEntryView(entry: JournalEntry) {
    this.entryView.emit(entry);
  }
}
