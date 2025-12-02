import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

export interface PurchaseStats {
  totalPurchases: number;
  totalValue: number;
  thisMonth: number;
  pendingPayments: number;
}

/**
 * Purchase statistics cards component
 * Displays key metrics in a responsive grid
 */
@Component({
  selector: 'app-purchase-stats',
  imports: [CommonModule],
  templateUrl: './purchase-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseStatsComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly stats = input.required<PurchaseStats>();

  formatCurrency(amount: number): string {
    // totalValue is in cents, convert to currency format
    return this.currencyService.format(amount);
  }
}
