import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { AppIconComponent } from '../icon/app-icon.component';

/**
 * TrendCardComponent — the ONE insight/trend card for the dashboard
 * (docs/DESIGN_SYSTEM.md, "The List Page").
 *
 * Chrome: standard card recipe; a `type-heading` title row with an optional
 * leading icon and a collapse chevron; body separated by a hairline divider.
 * Collapse is lazy by convention — pages should only fetch chart data when
 * `open` becomes true (see customers/orders for the pattern).
 *
 * Usage:
 *   <app-trend-card title="Customer growth trend" [(open)]="trendOpen" [loading]="analyticsLoading()">
 *     <app-period-selector [selected]="period()" (selectedChange)="onPeriodChange($event)" />
 *     <app-echart-container [option]="chartOption()" height="220px" />
 *   </app-trend-card>
 */
@Component({
  selector: 'app-trend-card',
  standalone: true,
  imports: [CommonModule, NgIcon, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors touch-manipulation text-left"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        @if (icon()) {
          <app-icon [name]="icon()!" size="sm" class="text-base-content/50" />
        }
        <span class="type-heading flex-1">{{ title() }}</span>
        <ng-icon
          name="heroChevronDown"
          size="0.875rem"
          class="text-base-content/30 transition-transform duration-200"
          [class.rotate-180]="open()"
        />
      </button>
      <div class="collapsible" [class.open]="open()">
        <div class="border-t border-base-300/60">
          @if (loading()) {
            <div class="flex items-center justify-center py-8">
              <span class="loading loading-spinner loading-sm text-primary"></span>
            </div>
          } @else {
            <div class="p-4 space-y-3">
              <ng-content />
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class TrendCardComponent {
  /** Card title, e.g. "Order volume trend". */
  readonly title = input.required<string>();
  /** Optional leading heroicon (registered in shared/icons/app-icons.ts). */
  readonly icon = input<string>();
  /** Two-way collapsed state; pages lazy-load chart data when it opens. */
  readonly open = model(false);
  /** Shows a centered spinner instead of the projected chart. */
  readonly loading = input(false);
}
