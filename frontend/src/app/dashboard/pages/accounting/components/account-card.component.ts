import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LedgerAccount } from '../../../../core/services/ledger/ledger.service';
import { AccountNode } from './accounts-tab.component';

@Component({
  selector: 'app-account-card',
  imports: [CommonModule],
  templateUrl: './account-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCardComponent {
  account = input.required<AccountNode>();
  selectedAccount = input.required<LedgerAccount | null>();
  formatCurrency = input.required<(amount: number) => string>();
  getDisplayBalance = input.required<(account: AccountNode) => number>();
  level = input.required<number>();

  accountSelect = output<LedgerAccount>();
  viewTransactions = output<LedgerAccount>();

  onAccountClick(account: LedgerAccount) {
    this.accountSelect.emit(account);
  }

  onViewTransactions(account: LedgerAccount, event: Event) {
    event.stopPropagation();
    this.viewTransactions.emit(account);
  }
}
