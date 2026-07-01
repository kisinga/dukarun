import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RefreshButtonComponent } from './refresh-button.component';

/**
 * Standardized dashboard page header.
 *
 * One layout everywhere: the title (≤24px, tight) sits left; a summary
 * `[stats]` slot (typically <app-stat-bar>), any `[actions]`, and an optional
 * refresh button fill the space to the right — so page-level stats never eat a
 * dedicated vertical band. Wraps below the title on narrow screens.
 *
 * ```html
 * <app-page-header title="Payments" subtitle="…" [isLoading]="loading()" (refresh)="reload()">
 *   <app-x-stats stats … />
 *   <button actions …>New</button>
 * </app-page-header>
 * ```
 */
@Component({
  selector: 'app-page-header',
  imports: [RefreshButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      Responsive header. Mobile: [title … refresh] on row 1, stats wrap to row 2
      (so the refresh never orphans below the pills). Desktop: [title … stats refresh]
      on one row. Driven by flex order + margin-auto so no content is projected twice.
    -->
    <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div class="order-1 min-w-0">
        <h1 class="text-xl lg:text-2xl font-bold tracking-tight truncate">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="text-sm text-base-content/60 mt-0.5 truncate">{{ subtitle() }}</p>
        }
      </div>

      <!-- Actions + refresh: top-right on mobile, trailing on desktop -->
      <div class="order-2 ml-auto flex items-center gap-2 shrink-0 sm:order-3 sm:ml-0">
        <ng-content select="[actions]"></ng-content>
        @if (showRefresh()) {
          <app-refresh-button
            [isLoading]="isLoading()"
            [title]="refreshTitle()"
            (refresh)="refresh.emit()"
          />
        }
      </div>

      <!-- Stats: own full-width row on mobile, inline-right on desktop; hidden when empty -->
      <div
        class="order-3 w-full flex flex-wrap items-center gap-x-4 gap-y-2 empty:hidden sm:order-2 sm:ml-auto sm:w-auto"
      >
        <ng-content select="[header-stats]"></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly showRefresh = input(true);
  readonly isLoading = input(false);
  readonly refreshTitle = input('Refresh');

  readonly refresh = output<void>();
}
