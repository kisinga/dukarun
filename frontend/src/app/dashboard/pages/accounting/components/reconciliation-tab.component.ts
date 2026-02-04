import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Reconciliation } from '../../../../core/services/cashier-session/cashier-session.service';

@Component({
  selector: 'app-reconciliation-tab',
  imports: [CommonModule],
  templateUrl: './reconciliation-tab.component.html',
  styleUrl: './reconciliation-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationTabComponent {
  reconciliations = input.required<Reconciliation[]>();
  isLoading = input.required<boolean>();
  totalItems = input.required<number>();
  currentPage = input.required<number>();
  pageSize = input.required<number>();
  formatDate = input.required<(date: string) => string>();
  formatCurrency = input.required<(amountCentsOrString: string) => string>();

  pageChange = output<number>();

  totalPages = computed(() => {
    const total = this.totalItems();
    const size = this.pageSize();
    return Math.ceil(total / size) || 1;
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  hasVariance(r: Reconciliation): boolean {
    const v = parseInt(r.varianceAmount, 10);
    return !Number.isNaN(v) && v !== 0;
  }

  onPageChange(page: number) {
    this.pageChange.emit(page);
  }
}
