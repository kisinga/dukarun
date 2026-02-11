import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LedgerAccount, JournalEntry } from '../../../../core/services/ledger/ledger.service';
import type { AccountingContext } from '../accounting-context';
import { sourceTypeLabel } from '../utils/accounting-formatting';

@Component({
  selector: 'app-overview-tab',
  imports: [CommonModule],
  templateUrl: './overview-tab.component.html',
  styleUrl: './overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTabComponent {
  context = input.required<AccountingContext>();
  sourceTypeLabel = sourceTypeLabel;

  accountSelect = output<LedgerAccount>();
  entryView = output<JournalEntry>();

  onAccountClick(account: LedgerAccount) {
    this.accountSelect.emit(account);
  }

  onEntryView(entry: JournalEntry) {
    this.entryView.emit(entry);
  }
}
