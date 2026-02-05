import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { JournalEntry } from '../../../../core/services/ledger/ledger.service';
import type { TransactionsTabContext } from '../accounting-context';

@Component({
  selector: 'app-transactions-tab',
  imports: [CommonModule],
  templateUrl: './transactions-tab.component.html',
  styleUrl: './transactions-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsTabComponent {
  context = input.required<TransactionsTabContext>();

  entryToggle = output<string>();
  entryView = output<JournalEntry>();
  expandAll = output<void>();
  collapseAll = output<void>();
  pageChange = output<number>();
  clearFilters = output<void>();

  onToggleEntry(entryId: string) {
    this.entryToggle.emit(entryId);
  }

  onViewEntry(entry: JournalEntry) {
    this.entryView.emit(entry);
  }

  onPageChange(page: number) {
    this.pageChange.emit(page);
  }

  hasActiveFilters(): boolean {
    const f = this.context().filters;
    return !!(
      f.searchTerm ||
      f.selectedAccount ||
      f.sourceTypeFilter ||
      f.dateFilter.start ||
      f.dateFilter.end
    );
  }
}
