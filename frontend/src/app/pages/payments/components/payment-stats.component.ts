import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../../shared/components/dashboard/stat-bar.component';

export interface PaymentStats {
  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
}

/**
 * Payment summary — a compact inline stat line. The three meaningful states are
 * interactive filters (settled/pending/failed); the plain total stays neutral.
 * Semantic colour only where it means something — successful=success,
 * pending=warning, failed=error.
 */
@Component({
  selector: 'app-payment-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onFilterClick($event)" />`,
})
export class PaymentStatsComponent {
  readonly stats = input.required<PaymentStats>();
  readonly activeStateFilter = input<string>('');
  readonly filterClick = output<{ type: string; value: string; color: string }>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const active = this.activeStateFilter();
    return [
      { label: 'payments', value: s.totalPayments },
      {
        label: 'paid',
        value: s.successfulPayments,
        tone: 'success',
        filter: 'Settled',
        active: active === 'Settled',
      },
      {
        label: 'pending',
        value: s.pendingPayments,
        tone: 'warning',
        filter: 'Created',
        active: active === 'Created',
      },
      {
        label: 'failed',
        value: s.failedPayments,
        tone: 'error',
        filter: 'Declined',
        active: active === 'Declined',
      },
    ];
  });

  onFilterClick(value: string): void {
    // Map filter values to their badge colors
    const colorMap: Record<string, string> = {
      Settled: 'primary',
      Created: 'warning',
      Declined: 'error',
    };
    this.filterClick.emit({ type: 'state', value, color: colorMap[value] || 'primary' });
  }
}
