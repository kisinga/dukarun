import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LedgerAccount } from '../../../../core/services/ledger/ledger.service';
import { sourceTypeLabel } from '../utils/accounting-formatting';

export interface AccountingFilters {
  searchTerm: string;
  selectedAccount: LedgerAccount | null;
  sourceTypeFilter: string;
  dateFilter: { start?: string; end?: string };
  accounts: LedgerAccount[];
  sourceTypes: string[];
  showQuickFilters: boolean;
}

@Component({
  selector: 'app-accounting-filters',
  imports: [CommonModule],
  templateUrl: './accounting-filters.component.html',
  styleUrl: './accounting-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingFiltersComponent {
  filters = input.required<AccountingFilters>();
  sourceTypeLabel = sourceTypeLabel;

  searchTermChange = output<string>();
  accountChange = output<string>();
  sourceTypeChange = output<string>();
  dateFilterChange = output<{ start?: string; end?: string }>();
  quickFilterChange = output<string>();
  clearFilters = output<void>();

  onSearchChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchTermChange.emit(value);
  }

  onAccountChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.accountChange.emit(value);
  }

  onSourceTypeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.sourceTypeChange.emit(value);
  }

  onStartDateChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dateFilterChange.emit({
      start: value || undefined,
      end: this.filters().dateFilter.end,
    });
  }

  onEndDateChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dateFilterChange.emit({
      start: this.filters().dateFilter.start,
      end: value || undefined,
    });
  }

  onQuickFilter(period: string) {
    this.quickFilterChange.emit(period);
  }
}
