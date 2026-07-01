import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Mobile-first KPI strip (spec §10): on phones the stats are a horizontally
 * scrollable row so each number stays legible instead of being crushed into a
 * cramped grid; from `sm` up it becomes a clean grid.
 *
 * `cols` sets the desktop column count (2–6). Direct children (typically
 * `<app-stat-card>`) get a sensible min-width on mobile and full-width in the grid.
 *
 * Usage:
 * ```html
 * <app-stat-strip [cols]="4">
 *   <app-stat-card ... />
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
    // Full literal classes per column count (Tailwind v4 purge-safe).
    const grid: Record<number, string> = {
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-3',
      4: 'sm:grid-cols-2 lg:grid-cols-4',
      5: 'sm:grid-cols-3 lg:grid-cols-5',
      6: 'sm:grid-cols-3 lg:grid-cols-6',
    };
    return [
      // mobile: horizontal scroll strip
      'flex gap-2.5 overflow-x-auto pb-1',
      '[&>*]:min-w-[8.5rem] [&>*]:shrink-0 [&>*]:snap-start snap-x',
      // sm+: real grid
      'sm:grid sm:gap-3 sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0 sm:[&>*]:shrink',
      grid[this.cols()],
    ].join(' ');
  }
}
