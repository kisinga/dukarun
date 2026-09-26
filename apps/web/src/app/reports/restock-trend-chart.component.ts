import { Component, computed, input } from '@angular/core';
import {
  bucketDatedSeries,
  chartResolutionLabel,
  type ChartResolution,
} from '../shared/chart-series';
import type { RestockTrendPoint } from './reports.service';

type TrendMetric = 'quantity' | 'revenue';

@Component({
  selector: 'app-restock-trend-chart',
  template: `
    <div class="relative" [attr.aria-busy]="loading()">
      <div class="w-full transition-opacity" [class.opacity-60]="loading()">
        <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span class="flex items-center gap-2 font-medium">
            <span class="h-0.5 w-5 bg-primary"></span>Current period
          </span>
          <span class="flex items-center gap-2 text-base-content/60">
            <span class="h-0.5 w-5 border-t-2 border-dashed border-base-content/40"></span>
            Previous period
          </span>
          <span class="ml-auto text-base-content/60">
            {{ resolutionLabel() }} · {{ peakLabel() }} peak
          </span>
        </div>

        <div
          class="relative h-64 overflow-hidden border-y border-base-300/70 bg-base-200/20"
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
          <div class="relative flex h-full w-full items-end gap-1 px-3 pb-8 pt-4">
            @for (point of plottedPoints(); track point.key; let index = $index) {
              <div class="relative flex h-full min-w-0 flex-1 items-end justify-center gap-px">
                <span
                  class="w-1/2 rounded-t-field bg-base-content/25"
                  [style.height.%]="point.previousHeight"
                  [attr.title]="pointLabel(point, 'previous')"
                ></span>
                <span
                  class="w-1/2 rounded-t-field bg-primary transition-colors hover:bg-primary/80"
                  [style.height.%]="point.currentHeight"
                  [attr.title]="pointLabel(point, 'current')"
                ></span>
                @if (showAxisLabel(index)) {
                  <span class="absolute -bottom-6 whitespace-nowrap text-xs text-base-content/60">
                    {{ axisDay(point.firstDay, resolution()) }}
                  </span>
                }
              </div>
            }
          </div>
        </div>
      </div>
      @if (loading()) {
        <div class="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-2">
          <span
            class="flex items-center gap-2 rounded-field border border-base-300 bg-base-100/90 px-3 py-2 text-xs shadow-sm"
          >
            <span class="loading loading-spinner loading-xs"></span>Updating chart
          </span>
        </div>
      }
    </div>
  `,
})
export class RestockTrendChartComponent {
  readonly points = input.required<RestockTrendPoint[]>();
  readonly metric = input<TrendMetric>('quantity');
  readonly loading = input(false);
  private readonly series = computed(() => bucketDatedSeries(this.points()));
  protected readonly resolution = computed(() => this.series().resolution);
  protected readonly resolutionLabel = computed(() => chartResolutionLabel(this.resolution()));
  protected readonly plottedPoints = computed(() => {
    const source = this.series().buckets.map(bucket => ({
      key: bucket.key,
      firstDay: bucket.firstDay,
      lastDay: bucket.lastDay,
      current: bucket.points.reduce(
        (sum, point) =>
          sum + (this.metric() === 'quantity' ? point.currentQuantity : point.currentRevenue),
        0
      ),
      previous: bucket.points.reduce(
        (sum, point) =>
          sum + (this.metric() === 'quantity' ? point.previousQuantity : point.previousRevenue),
        0
      ),
    }));
    const values = source.flatMap(point => [point.current, point.previous]);
    const maximum = Math.max(...values, 1);
    return source.map(point => {
      return {
        ...point,
        currentHeight: point.current <= 0 ? 1 : Math.max(3, (point.current / maximum) * 100),
        previousHeight: point.previous <= 0 ? 1 : Math.max(3, (point.previous / maximum) * 100),
      };
    });
  });
  protected readonly peakLabel = computed(() => {
    const maximum = Math.max(
      ...this.plottedPoints().flatMap(point => [point.current, point.previous]),
      0
    );
    return this.formatValue(maximum);
  });
  protected readonly ariaLabel = computed(
    () =>
      `${this.resolutionLabel()} ${this.metric() === 'quantity' ? 'units sold' : 'sales value'} trend compared with the previous equal period`
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
    const length = this.plottedPoints().length;
    if (index === 0 || index === length - 1) return true;
    return index % Math.max(Math.ceil(length / 6), 1) === 0;
  }

  protected pointLabel(
    point: { firstDay: string; lastDay: string; current: number; previous: number },
    period: 'current' | 'previous'
  ): string {
    const range =
      point.firstDay === point.lastDay
        ? this.shortDay(point.firstDay)
        : `${this.shortDay(point.firstDay)}–${this.shortDay(point.lastDay)}`;
    return `${range} ${period}: ${this.formatValue(point[period])}`;
  }

  protected axisDay(day: string, resolution: ChartResolution): string {
    return new Intl.DateTimeFormat(
      'en-KE',
      resolution === 'monthly'
        ? { month: 'short', year: '2-digit' }
        : { day: 'numeric', month: 'short' }
    ).format(new Date(`${day}T00:00:00Z`));
  }

  protected shortDay(day: string): string {
    return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
      new Date(`${day}T00:00:00Z`)
    );
  }
}
