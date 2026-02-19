import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  DashboardService,
  type StockValuationType,
} from '../../../../../core/services/dashboard.service';
import { CurrencyService } from '../../../../../core/services/currency.service';

const VALUATION_LABELS: Record<StockValuationType, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  COST: 'Cost',
};

@Component({
  selector: 'app-stock-value-ranking-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-base-300/60">
        <h2 class="text-sm font-bold text-base-content/70">Stock value at hand</h2>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 py-4">
        @for (type of valuationTypes; track type) {
          <div
            class="rounded-lg p-3 bg-base-200/30 flex flex-col gap-2 transition-all duration-200"
            [class.ring-2]="activeCard() === type"
            [class.ring-primary]="activeCard() === type"
            [class.ring-offset-2]="activeCard() === type"
            [class.ring-offset-base-100]="activeCard() === type"
          >
            <span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
              Stock value · {{ VALUATION_LABELS[type] }}
            </span>
            @if (stockValueLoading() && !stockValueStats()) {
              <div class="skeleton h-7 w-20 rounded mt-0.5"></div>
            } @else if (stockValueStats(); as sv) {
              <p
                class="text-lg font-bold tabular-nums"
                [class.text-primary]="type === 'RETAIL'"
                [class.text-success]="type === 'COST'"
              >
                {{
                  currencyService.format(
                    type === 'RETAIL' ? sv.retail : type === 'WHOLESALE' ? sv.wholesale : sv.cost
                  )
                }}
              </p>
            } @else {
              <p class="text-base-content/50">—</p>
            }
            <button
              type="button"
              class="btn btn-ghost btn-xs mt-auto touch-manipulation min-h-[44px] sm:min-h-0"
              (click)="topByValueClick.emit(type)"
            >
              Top by value
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class StockValueRankingSectionComponent {
  protected readonly dashboardService = inject(DashboardService);
  protected readonly currencyService = inject(CurrencyService);

  protected readonly VALUATION_LABELS = VALUATION_LABELS;
  protected readonly valuationTypes: StockValuationType[] = ['RETAIL', 'WHOLESALE', 'COST'];

  readonly stockValueStats = this.dashboardService.stockValueStats;
  readonly stockValueLoading = this.dashboardService.stockValueLoading;

  /** When set, the matching card is highlighted (ring). */
  readonly activeCard = input<StockValuationType | null>(null);
  readonly topByValueClick = output<StockValuationType>();
}
