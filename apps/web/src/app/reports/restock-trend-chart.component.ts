import { Component, computed, input } from '@angular/core';
import type { RestockTrendPoint } from './reports.service';

type TrendMetric = 'quantity' | 'revenue';

@Component({
  selector: 'app-restock-trend-chart',
  template: `
    <div class="w-full">
      <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span class="flex items-center gap-2 font-medium">
          <span class="h-0.5 w-5 bg-primary"></span>Current period
        </span>
        <span class="flex items-center gap-2 text-base-content/60">
          <span class="h-0.5 w-5 border-t-2 border-dashed border-base-content/40"></span>
          Previous period
        </span>
        <span class="ml-auto text-base-content/60">{{ peakLabel() }} peak</span>
      </div>

      <div
        class="relative h-64 overflow-x-auto overflow-y-hidden border-y border-base-300/70 bg-base-200/20"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        <span
          class="pointer-events-none absolute inset-x-0 top-1/4 border-t border-base-300/70"
        ></span>
        <span
          class="pointer-events-none absolute inset-x-0 top-1/2 border-t border-base-300/70"
        ></span>
        <span
          class="pointer-events-none absolute inset-x-0 top-3/4 border-t border-base-300/70"
        ></span>
        <div
          class="relative flex h-full min-w-full items-end gap-px px-3 pb-8 pt-4"
          [style.width.px]="chartWidth()"
        >
          @for (point of plottedPoints(); track point.day; let index = $index) {
            <div class="relative flex h-full min-w-1 flex-1 items-end justify-center gap-px">
              <span
                class="w-1/2 min-w-1 rounded-t-field bg-base-content/25"
                [style.height.%]="point.previousHeight"
                [attr.title]="point.day + ' previous: ' + formatValue(point.previous)"
              ></span>
              <span
                class="w-1/2 min-w-1 rounded-t-field bg-primary transition-colors hover:bg-primary/80"
                [style.height.%]="point.currentHeight"
                [attr.title]="point.day + ': ' + formatValue(point.current)"
              ></span>
              @if (showAxisLabel(index)) {
                <span class="absolute -bottom-6 whitespace-nowrap text-xs text-base-content/60">
                  {{ shortDay(point.day) }}
                </span>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class RestockTrendChartComponent {
  readonly points = input.required<RestockTrendPoint[]>();
  readonly metric = input<TrendMetric>('quantity');
  protected readonly plottedPoints = computed(() => {
    const source = this.points();
    const values = source.flatMap(point =>
      this.metric() === 'quantity'
        ? [point.currentQuantity, point.previousQuantity]
        : [point.currentRevenue, point.previousRevenue]
    );
    const maximum = Math.max(...values, 1);
    return source.map(point => {
      const current = this.metric() === 'quantity' ? point.currentQuantity : point.currentRevenue;
      const previous =
        this.metric() === 'quantity' ? point.previousQuantity : point.previousRevenue;
      return {
        day: point.day,
        current,
        previous,
        currentHeight: current <= 0 ? 1 : Math.max(3, (current / maximum) * 100),
        previousHeight: previous <= 0 ? 1 : Math.max(3, (previous / maximum) * 100),
      };
    });
  });
  protected readonly chartWidth = computed(() => Math.max(320, this.points().length * 8));
  protected readonly peakLabel = computed(() => {
    const maximum = Math.max(
      ...this.points().flatMap(point =>
        this.metric() === 'quantity'
          ? [point.currentQuantity, point.previousQuantity]
          : [point.currentRevenue, point.previousRevenue]
      ),
      0
    );
    return this.formatValue(maximum);
  });
  protected readonly ariaLabel = computed(
    () =>
      `${this.metric() === 'quantity' ? 'Units sold' : 'Sales value'} trend compared with the previous equal period`
  );

  protected formatValue(value: number): string {
    if (this.metric() === 'quantity') {
      return value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    }
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  protected showAxisLabel(index: number): boolean {
    const length = this.points().length;
    if (index === 0 || index === length - 1) return true;
    return index % Math.max(Math.ceil(length / 6), 1) === 0;
  }

  protected shortDay(day: string): string {
    return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
      new Date(`${day}T00:00:00Z`)
    );
  }
}
