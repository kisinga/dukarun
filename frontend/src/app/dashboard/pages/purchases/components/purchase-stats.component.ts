import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../components/shared/stat-bar.component';
import { CurrencyService } from '../../../../core/services/currency.service';

export interface PurchaseStats {
  totalPurchases: number;
  totalValue: number;
  thisMonth: number;
  pendingPayments: number;
}

/**
 * Purchase summary — a compact inline stat line. Only "pending" is an interactive
 * (single-toggle) filter and the sole meaningful state, so it alone is coloured.
 */
@Component({
  selector: 'app-purchase-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onPendingPaymentsClick()" />`,
})
export class PurchaseStatsComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly stats = input.required<PurchaseStats>();
  readonly pendingPaymentsActive = input<boolean>(false);
  readonly pendingPaymentsClick = output<void>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    return [
      { label: 'purchases', value: s.totalPurchases },
      { label: 'total value', value: this.formatCurrency(s.totalValue) },
      { label: 'this month', value: s.thisMonth },
      {
        label: 'pending',
        value: s.pendingPayments,
        tone: s.pendingPayments > 0 ? 'warning' : 'neutral',
        filter: 'pending',
        active: this.pendingPaymentsActive(),
      },
    ];
  });

  formatCurrency(amount: number): string {
    // totalValue is in cents, convert to currency format
    return this.currencyService.format(amount);
  }

  onPendingPaymentsClick(): void {
    this.pendingPaymentsClick.emit();
  }
}
