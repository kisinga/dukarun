import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * EntityDetailLayoutComponent — shared presentational shell for all entity detail pages.
 *
 * Provides consistent chrome: back navigation, title/subtitle, loading/error states,
 * and content projection slots. This is purely layout — it does NOT fetch data.
 *
 * Usage:
 * ```html
 * <app-entity-detail-layout
 *   [title]="product.name"
 *   [subtitle]="product.sku"
 *   [isLoading]="isLoading()"
 *   [error]="error()"
 *   (back)="goBack()"
 * >
 *   <div header-actions>
 *     <button class="btn btn-sm">Edit</button>
 *   </div>
 *   <!-- default slot: detail body -->
 *   <div class="card bg-base-100 shadow">...</div>
 * </app-entity-detail-layout>
 * ```
 */
@Component({
  selector: 'app-entity-detail-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container-app py-4 md:py-6 space-y-4 md:space-y-6 anim-stagger">
      <!-- Back + Title bar -->
      <div class="flex items-center gap-3">
        <button
          class="btn btn-ghost btn-sm btn-circle shrink-0"
          (click)="back.emit()"
          aria-label="Go back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold truncate">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="text-sm text-base-content/60 truncate">{{ subtitle() }}</p>
          }
        </div>
        <ng-content select="[header-actions]" />
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
      } @else if (error()) {
        <!-- Error -->
        <div role="alert" class="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{{ error() }}</span>
        </div>
      } @else {
        <!-- Default slot: entity detail body -->
        <ng-content />
      }
    </div>
  `,
})
export class EntityDetailLayoutComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly isLoading = input<boolean>(false);
  readonly error = input<string>();

  readonly back = output<void>();
}
