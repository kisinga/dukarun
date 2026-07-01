import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

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
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div class="min-w-0">
        <h1 class="text-xl lg:text-2xl font-bold tracking-tight truncate">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="text-sm text-base-content/60 mt-0.5 truncate">{{ subtitle() }}</p>
        }
      </div>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 sm:justify-end">
        <ng-content select="[header-stats]"></ng-content>
        <!-- Actions + refresh: one grouped cluster, kept apart from the stats -->
        <div class="flex items-center gap-2">
          <ng-content select="[actions]"></ng-content>
          @if (showRefresh()) {
            <button
              (click)="refresh.emit()"
              [disabled]="isLoading()"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-base-300 bg-base-100 text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-60"
              [attr.title]="refreshTitle()"
              [attr.aria-label]="refreshTitle()"
            >
              <!-- Spin the icon itself while loading — same element, same size, no jump -->
              <ng-icon name="heroArrowPath" size="1.125rem" [class.animate-spin]="isLoading()" />
            </button>
          }
        </div>
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
