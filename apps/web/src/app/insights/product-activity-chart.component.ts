import { Component, computed, input } from '@angular/core';
import {
  bucketDatedSeries,
  chartResolutionLabel,
  type ChartResolution,
} from '../shared/chart-series';
import type { ProductInventoryPosition, ProductTrendPoint } from './insights.models';

@Component({
  selector: 'app-product-activity-chart',
  template: `
    <div class="relative" [attr.aria-busy]="loading()">
      <div class="grid gap-4 transition-opacity xl:grid-cols-5" [class.opacity-60]="loading()">
        <section class="rounded-box border border-base-300 bg-base-100 p-4 xl:col-span-3">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="font-semibold">{{ demandResolutionLabel() }} demand</h4>
              <p class="type-caption mt-1">Net units sold, with returned units separated.</p>
            </div>
            <div class="flex gap-4 text-right text-xs">
              <div>
                <p class="text-base-content/55">Net units</p>
                <p class="mt-0.5 font-semibold tabular-nums">{{ totalNetLabel() }}</p>
              </div>
              <div>
                <p class="text-base-content/55">Active days</p>
                <p class="mt-0.5 font-semibold tabular-nums">{{ activeDays() }}</p>
              </div>
              <div>
                <p class="text-base-content/55">Returned</p>
                <p class="mt-0.5 font-semibold tabular-nums">{{ returnRateLabel() }}</p>
              </div>
            </div>
          </header>

          @if (hasDemand()) {
            <div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-base-content/60">
              <span class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-sm bg-primary"></span>Net sold
              </span>
              <span class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-sm bg-error/70"></span>Returned
              </span>
              <span class="ml-auto">Peak {{ peakDemandLabel() }} units per period</span>
            </div>
            <div
              class="relative mt-3 h-52 overflow-hidden border-y border-base-300/70 bg-base-200/20"
              role="img"
              [attr.aria-label]="demandAriaLabel()"
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
                @for (point of demandPoints(); track point.key; let index = $index) {
                  <div
                    class="relative flex h-full min-w-0 flex-1 items-end justify-center gap-px"
                    [attr.title]="demandPointLabel(point)"
                  >
                    <span
                      class="w-1/2 rounded-t-field bg-primary transition-colors hover:bg-primary/80"
                      [style.height.%]="point.netHeight"
                    ></span>
                    @if (point.returns > 0) {
                      <span
                        class="w-1/3 rounded-t-field bg-error/70"
                        [style.height.%]="point.returnHeight"
                      ></span>
                    }
                    @if (showAxisLabel(index, demandPoints().length)) {
                      <span
                        class="absolute -bottom-6 whitespace-nowrap text-xs text-base-content/55"
                      >
                        {{ axisDay(point.firstDay, demandResolution()) }}
                      </span>
                    }
                  </div>
                }
              </div>
            </div>
          } @else {
            <div
              class="mt-4 flex min-h-52 items-center justify-center rounded-field border border-dashed border-base-300 bg-base-200/20 px-6 text-center"
            >
              <div>
                <p class="font-semibold">No completed-sale demand</p>
                <p class="type-caption mt-1">No units were sold or returned in this period.</p>
              </div>
            </div>
          }
        </section>

        <section class="rounded-box border border-base-300 bg-base-100 p-4 xl:col-span-2">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="font-semibold">Stock position</h4>
              <p class="type-caption mt-1">
                {{ stockResolutionLabel() }} closing stock across the period.
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-base-content/55">Current</p>
              <p class="font-semibold tabular-nums">{{ currentStockLabel() }}</p>
            </div>
          </header>

          @if (stockPoints().length > 0) {
            <div class="mt-5" role="img" [attr.aria-label]="stockAriaLabel()">
              <svg
                data-visualization="stock-time-series"
                class="h-44 w-full overflow-visible border-y border-base-300/70 bg-base-200/20"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line x1="0" y1="25" x2="100" y2="25" class="stroke-base-300" stroke-width="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" class="stroke-base-300" stroke-width="0.5" />
                <line x1="0" y1="75" x2="100" y2="75" class="stroke-base-300" stroke-width="0.5" />
                <polygon [attr.points]="stockAreaPoints()" class="fill-primary/10" />
                <polyline
                  [attr.points]="stockLinePoints()"
                  fill="none"
                  class="stroke-primary"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
              </svg>
              <div class="mt-2 flex justify-between text-xs text-base-content/55">
                <span>{{ firstStockDay() }}</span>
                <span>{{ lastStockDay() }}</span>
              </div>
            </div>
            <dl class="mt-4 grid grid-cols-3 gap-3 border-t border-base-200 pt-3 text-sm">
              <div>
                <dt class="type-caption">Low</dt>
                <dd class="font-semibold tabular-nums">{{ minimumStockLabel() }}</dd>
              </div>
              <div>
                <dt class="type-caption">High</dt>
                <dd class="font-semibold tabular-nums">{{ maximumStockLabel() }}</dd>
              </div>
              <div>
                <dt class="type-caption">Stockout days</dt>
                <dd class="font-semibold tabular-nums">{{ stockoutDays() }}</dd>
              </div>
            </dl>
          } @else {
            <div
              class="mt-4 flex min-h-52 items-center justify-center rounded-field border border-dashed border-base-300 bg-base-200/20 px-6 text-center"
            >
              <div>
                <p class="font-semibold">Stock history unavailable</p>
                <p class="type-caption mt-1">
                  A stock line appears after the first captured position.
                </p>
              </div>
            </div>
          }
        </section>
      </div>
      @if (loading()) {
        <div class="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-3">
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
export class ProductActivityChartComponent {
  readonly trend = input.required<ProductTrendPoint[]>();
  readonly positions = input.required<ProductInventoryPosition[]>();
  readonly loading = input(false);

  private readonly rawDemandPoints = computed(() =>
    this.trend().map(point => ({
      day: point.day,
      gross: Number(point.gross_quantity ?? 0),
      returns: Number(point.returned_quantity ?? 0),
      net: Number(point.net_quantity ?? 0),
    }))
  );
  private readonly demandSeries = computed(() => bucketDatedSeries(this.rawDemandPoints()));
  protected readonly demandResolution = computed(() => this.demandSeries().resolution);
  protected readonly demandResolutionLabel = computed(() =>
    chartResolutionLabel(this.demandResolution())
  );
  protected readonly demandPoints = computed(() => {
    const source = this.demandSeries().buckets.map(bucket => ({
      key: bucket.key,
      firstDay: bucket.firstDay,
      lastDay: bucket.lastDay,
      gross: bucket.points.reduce((sum, point) => sum + point.gross, 0),
      returns: bucket.points.reduce((sum, point) => sum + point.returns, 0),
      net: bucket.points.reduce((sum, point) => sum + point.net, 0),
    }));
    const maximum = Math.max(...source.map(point => Math.max(point.gross, point.net)), 1);
    return source.map(point => ({
      ...point,
      netHeight: point.net <= 0 ? 1 : Math.max(4, (point.net / maximum) * 100),
      returnHeight: point.returns <= 0 ? 0 : Math.max(4, (point.returns / maximum) * 100),
    }));
  });
  protected readonly hasDemand = computed(() =>
    this.rawDemandPoints().some(point => point.gross > 0 || point.returns > 0 || point.net > 0)
  );
  protected readonly activeDays = computed(
    () => this.rawDemandPoints().filter(point => point.net !== 0 || point.returns > 0).length
  );
  protected readonly totalNet = computed(() =>
    this.rawDemandPoints().reduce((sum, point) => sum + point.net, 0)
  );
  protected readonly totalGross = computed(() =>
    this.rawDemandPoints().reduce((sum, point) => sum + point.gross, 0)
  );
  protected readonly totalReturns = computed(() =>
    this.rawDemandPoints().reduce((sum, point) => sum + point.returns, 0)
  );
  protected readonly totalNetLabel = computed(() => this.quantity(this.totalNet()));
  protected readonly returnRateLabel = computed(() => {
    if (this.totalGross() <= 0) return '0%';
    return `${((this.totalReturns() / this.totalGross()) * 100).toLocaleString('en-KE', {
      maximumFractionDigits: 1,
    })}%`;
  });
  protected readonly peakDemandLabel = computed(() =>
    this.quantity(Math.max(...this.demandPoints().map(point => point.gross), 0))
  );
  protected readonly demandAriaLabel = computed(
    () =>
      `${this.demandResolutionLabel()} demand: ${this.totalNetLabel()} net units across ${this.activeDays()} active days, ${this.returnRateLabel()} returned`
  );

  private readonly stockSeries = computed(() => bucketDatedSeries(this.positions()));
  protected readonly stockResolutionLabel = computed(() =>
    chartResolutionLabel(this.stockSeries().resolution)
  );
  private readonly knownStockPoints = computed(() =>
    this.positions()
      .map(point => ({
        day: point.day,
        quantity:
          point.closing_quantity === null || point.closing_quantity === undefined
            ? null
            : Number(point.closing_quantity),
      }))
      .filter((point): point is { day: string; quantity: number } =>
        Number.isFinite(point.quantity)
      )
  );
  protected readonly stockPoints = computed(() => {
    const source = this.stockSeries().buckets;
    const known = source.flatMap((bucket, index) => {
      const point = [...bucket.points]
        .reverse()
        .find(item =>
          item.closing_quantity === null || item.closing_quantity === undefined
            ? false
            : Number.isFinite(Number(item.closing_quantity))
        );
      return point
        ? [{ day: bucket.lastDay, quantity: Number(point.closing_quantity), index }]
        : [];
    });
    const maximum = Math.max(...known.map(point => point.quantity), 1);
    const denominator = Math.max(source.length - 1, 1);
    return known.map(point => ({
      ...point,
      x: (point.index / denominator) * 100,
      y: 92 - (Math.max(point.quantity, 0) / maximum) * 82,
    }));
  });
  protected readonly stockLinePoints = computed(() =>
    this.stockPoints()
      .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ')
  );
  protected readonly stockAreaPoints = computed(() => {
    const points = this.stockPoints();
    if (points.length === 0) return '';
    return `${points[0].x.toFixed(2)},92 ${this.stockLinePoints()} ${points[points.length - 1].x.toFixed(2)},92`;
  });
  protected readonly currentStockLabel = computed(() =>
    this.quantity(this.knownStockPoints().at(-1)?.quantity ?? 0)
  );
  protected readonly minimumStockLabel = computed(() => {
    const points = this.knownStockPoints();
    return this.quantity(points.length > 0 ? Math.min(...points.map(point => point.quantity)) : 0);
  });
  protected readonly maximumStockLabel = computed(() =>
    this.quantity(Math.max(...this.knownStockPoints().map(point => point.quantity), 0))
  );
  protected readonly stockoutDays = computed(
    () => this.knownStockPoints().filter(point => point.quantity <= 0).length
  );
  protected readonly firstStockDay = computed(() => this.shortDay(this.positions()[0]?.day ?? ''));
  protected readonly lastStockDay = computed(() =>
    this.shortDay(this.positions().at(-1)?.day ?? '')
  );
  protected readonly stockAriaLabel = computed(
    () =>
      `Stock position from ${this.minimumStockLabel()} to ${this.maximumStockLabel()}, ending at ${this.currentStockLabel()}`
  );

  protected demandPointLabel(point: {
    firstDay: string;
    lastDay: string;
    gross: number;
    returns: number;
    net: number;
  }): string {
    const period =
      point.firstDay === point.lastDay
        ? this.shortDay(point.firstDay)
        : `${this.shortDay(point.firstDay)}–${this.shortDay(point.lastDay)}`;
    return `${period}: ${this.quantity(point.net)} net sold, ${this.quantity(point.returns)} returned`;
  }

  protected showAxisLabel(index: number, length: number): boolean {
    if (index === 0 || index === length - 1) return true;
    return index % Math.max(Math.ceil(length / 5), 1) === 0;
  }

  protected shortDay(day: string): string {
    if (!day) return '';
    return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
      new Date(`${day}T00:00:00Z`)
    );
  }

  protected axisDay(day: string, resolution: ChartResolution): string {
    if (!day) return '';
    return new Intl.DateTimeFormat(
      'en-KE',
      resolution === 'monthly'
        ? { month: 'short', year: '2-digit' }
        : { day: 'numeric', month: 'short' }
    ).format(new Date(`${day}T00:00:00Z`));
  }

  private quantity(value: number): string {
    return value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
  }
}
