import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
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
  readonly pendingPaymentsActive = input<boolean>(false);
  readonly clearPendingPayments = output<void>();

  readonly supplierIdFilter = input<string | null>(null);
  readonly supplierNameFilter = input<string | null>(null);
  readonly clearSupplierFilter = output<void>();

  clearSearch(): void {
    this.searchQuery.set('');
  }

  onClearPendingPayments(): void {
    this.clearPendingPayments.emit();
  }

  onClearSupplierFilter(): void {
    this.clearSupplierFilter.emit();
  }
}
