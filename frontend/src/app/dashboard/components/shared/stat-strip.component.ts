import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Mobile-first KPI strip (spec §10). Grid the whole way (never mixes `flex`
 * with `grid` — that display conflict was stretching cards vertically):
 * - mobile: a single row of fixed-width columns that scrolls horizontally, so
 *   each number stays legible instead of being crushed into a cramped grid;
 * - `sm`+: a normal responsive grid.
 *
 * `cols` sets the desktop column count (2–6).
 *
 * Usage:
 * ```html
 * <app-stat-strip [cols]="4">
 *   <app-stat-card ... />
 * </app-stat-strip>
 * ```
 */
@Component({
  selector: 'app-stat-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="stripClass()">
      <ng-content />
    </div>
  `,
})
export class StatStripComponent {
  /** Desktop column count (2–6). Mobile is always a scrollable strip. */
  readonly cols = input<2 | 3 | 4 | 5 | 6>(4);

  stripClass(): string {
    // Full literal classes per column count (Tailwind v4 purge-safe). Cards fill
    // the row evenly (no right-hand dead space) and align with the content below.
    const grid: Record<number, string> = {
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-3',
      4: 'sm:grid-cols-2 lg:grid-cols-4',
      5: 'sm:grid-cols-2 lg:grid-cols-5',
      6: 'sm:grid-cols-3 lg:grid-cols-6',
    };
    return [
      // mobile: horizontal-scroll row of fixed 10rem columns
      'grid grid-flow-col auto-cols-[10rem] gap-3 overflow-x-auto pb-1 snap-x [&>*]:snap-start',
      // sm+: real responsive grid that fills the width evenly
      'sm:grid-flow-row sm:auto-cols-auto sm:overflow-visible sm:pb-0',
      grid[this.cols()],
    ].join(' ');
  }
}
