import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../components/shared/stat-bar.component';

export interface OrderStats {
  totalOrders: number;
  draftOrders: number;
  unpaidOrders: number;
  paidOrders: number;
}

/**
 * Order summary — a compact inline stat line. Total is a plain count; the three
 * order states are single-select filters keyed by their order-state string.
 * Semantic colour only where it means something — unpaid=warning, paid=success;
 * total and draft stay neutral.
 */
@Component({
  selector: 'app-order-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onFilterClick($event)" />`,
})
export class OrderStatsComponent {
  readonly stats = input.required<OrderStats>();
  readonly activeStateFilter = input<string>('');
  readonly filterClick = output<{ type: string; value: string; color: string }>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const active = this.activeStateFilter();
    return [
      { label: 'orders', value: s.totalOrders },
      { label: 'draft', value: s.draftOrders, filter: 'Draft', active: active === 'Draft' },
      {
        label: 'unpaid',
        value: s.unpaidOrders,
        tone: 'warning',
        filter: 'ArrangingPayment',
        active: active === 'ArrangingPayment',
      },
      {
        label: 'paid',
        value: s.paidOrders,
        tone: 'success',
        filter: 'PaymentSettled',
        active: active === 'PaymentSettled',
      },
    ];
  });

  onFilterClick(value: string): void {
    const colorMap: Record<string, string> = {
      Draft: 'neutral',
      ArrangingPayment: 'warning',
      PaymentSettled: 'success',
    };
    this.filterClick.emit({ type: 'state', value, color: colorMap[value] || 'primary' });
  }
}
