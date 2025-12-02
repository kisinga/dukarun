import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Purchase search bar component
 */
@Component({
  selector: 'app-purchase-search-bar',
  imports: [CommonModule, FormsModule],
  templateUrl: './purchase-search-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSearchBarComponent {
  readonly placeholder = input<string>('Search by supplier, reference...');
  readonly searchQuery = model<string>('');

  clearSearch(): void {
    this.searchQuery.set('');
  }
}
