import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-supplier-search-bar',
  imports: [CommonModule],
  templateUrl: './supplier-search-bar.component.html',
  styleUrl: './supplier-search-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierSearchBarComponent {
  @Input({ required: true }) searchQuery!: string;
  @Output() searchChange = new EventEmitter<string>();
  @Input() activeFilters: {
    verified?: boolean;
    withAddresses?: boolean;
    recent?: boolean;
  } = {};
  @Input() filterColors: {
    verified?: string;
    withAddresses?: string;
    recent?: string;
  } = {};
  @Output() clearFilter = new EventEmitter<{ type: string }>();

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchChange.emit(target.value);
  }

  onClearFilter(type: string): void {
    this.clearFilter.emit({ type });
  }

  getFilterLabel(type: string): string {
    if (type === 'verified') return 'Verified';
    if (type === 'withAddresses') return 'With Addresses';
    if (type === 'recent') return 'Recent';
    return '';
  }
}
