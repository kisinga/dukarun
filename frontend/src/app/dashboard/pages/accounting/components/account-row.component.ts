import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { LedgerAccount } from '../../../../core/services/ledger/ledger.service';
import { AccountNode } from './accounts-tab.component';

@Component({
  selector: 'app-account-row',
  imports: [CommonModule],
  templateUrl: './account-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountRowComponent {
  account = input.required<AccountNode>();
  selectedAccount = input.required<LedgerAccount | null>();
  formatCurrency = input.required<(amount: number) => string>();
  getDisplayBalance = input.required<(account: AccountNode) => number>();
  level = input.required<number>();

  accountSelect = output<LedgerAccount>();
  viewTransactions = output<LedgerAccount>();

  readonly isExpanded = signal(false);

  toggleExpanded() {
    this.isExpanded.update((val) => !val);
  }

  onAccountClick(account: LedgerAccount) {
    this.accountSelect.emit(account);
  }

  onViewTransactions(account: LedgerAccount, event: Event) {
    event.stopPropagation();
    this.viewTransactions.emit(account);
  }
}
