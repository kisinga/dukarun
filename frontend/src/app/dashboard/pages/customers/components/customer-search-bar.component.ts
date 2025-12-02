import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-customer-search-bar',
  imports: [CommonModule],
  templateUrl: './customer-search-bar.component.html',
  styleUrl: './customer-search-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerSearchBarComponent {
  @Input({ required: true }) searchQuery!: string;
  @Output() searchChange = new EventEmitter<string>();
  @Input() activeFilters: { verified?: boolean; creditApproved?: boolean; recent?: boolean } = {};
  @Input() filterColors: { verified?: string; creditApproved?: string; recent?: string } = {};
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
    if (type === 'creditApproved') return 'Credit Approved';
    if (type === 'recent') return 'Recent';
    return '';
  }
}
