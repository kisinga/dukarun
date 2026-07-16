import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../shared/components/dashboard/stat-bar.component';
import { CurrencyService } from '../../../shared/services/currency.service';

export interface PurchaseStats {
  totalPurchases: number;
  totalValue: number;
  thisMonth: number;
  pendingPayments: number;
  overdue: number;
}

/**
 * Purchase summary — a compact inline stat line. "Pending" and "overdue" are
 * interactive (single-toggle) filters and are coloured when active.
 */
@Component({
  selector: 'app-purchase-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onSelect($event)" />`,
})
export class PurchaseStatsComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly stats = input.required<PurchaseStats>();
  readonly pendingPaymentsActive = input<boolean>(false);
  readonly overdueActive = input<boolean>(false);
  readonly pendingPaymentsClick = output<void>();
  readonly overdueClick = output<void>();

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
      {
        label: 'overdue',
        value: s.overdue,
        tone: s.overdue > 0 ? 'error' : 'neutral',
        filter: 'overdue',
        active: this.overdueActive(),
      },
    ];
  });

  formatCurrency(amount: number): string {
    // totalValue is in cents, convert to currency format
    return this.currencyService.format(amount);
  }

  onSelect(filter: string): void {
    if (filter === 'overdue') {
      this.overdueClick.emit();
    } else {
      // Existing pending filter behaviour for any other selection
      this.pendingPaymentsClick.emit();
    }
  }
}
