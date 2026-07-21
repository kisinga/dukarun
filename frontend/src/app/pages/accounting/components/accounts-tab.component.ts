import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LedgerAccount } from '@dukarun/ledger';
import type { AccountingContext } from '../accounting-context';
import type { AccountNode, HierarchicalAccounts } from '../account-node.types';
import { AccountCardComponent } from './account-card.component';
import { AccountRowComponent } from './account-row.component';
import { EmptyStateComponent } from '../../../shared/components/dashboard/empty-state.component';

export type { AccountNode, HierarchicalAccounts };

@Component({
  selector: 'app-accounts-tab',
  imports: [CommonModule, NgIcon, AccountCardComponent, AccountRowComponent, EmptyStateComponent],
  templateUrl: './accounts-tab.component.html',
  styleUrl: './accounts-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsTabComponent {
  context = input.required<AccountingContext>();

  accountSelect = output<LedgerAccount>();
  viewTransactions = output<LedgerAccount>();

  readonly accountTypes = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

  hasAccounts(): boolean {
    const h = this.context().hierarchicalAccounts;
    return this.accountTypes.some((type) => h[type]?.length > 0);
  }

  onAccountClick(account: LedgerAccount) {
    this.accountSelect.emit(account);
  }

  onViewTransactions(account: LedgerAccount, event: Event) {
    event.stopPropagation();
    this.viewTransactions.emit(account);
  }

  // Helper to get display balance (use calculatedBalance for parents, balance for leaves)
  getDisplayBalance(node: AccountNode): number {
    return node.children.length > 0 ? node.calculatedBalance : node.balance;
  }
}
