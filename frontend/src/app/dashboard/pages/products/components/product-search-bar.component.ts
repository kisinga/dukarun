import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Product search and filter bar component.
 * Provides search input with clear button and filter drawer toggle.
 * Search matches when all words appear in product name or manufacturer.
 */
@Component({
  selector: 'app-product-search-bar',
  imports: [CommonModule],
  templateUrl: './product-search-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSearchBarComponent {
  readonly placeholder = input<string>('Search by name or manufacturer');
  readonly searchQuery = input<string>('');
  readonly searchQueryChange = output<string>();

  onSearchChange(value: string): void {
    this.searchQueryChange.emit(value);
  }

  clearSearch(): void {
    this.searchQueryChange.emit('');
  }
}
