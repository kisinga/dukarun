import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

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
 *   <div class="card bg-base-100">...</div>
 * </app-entity-detail-layout>
 * ```
 */
@Component({
  selector: 'app-entity-detail-layout',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="py-4 md:py-6 space-y-4 md:space-y-6 anim-stagger">
      <!-- Back + Title bar -->
      <div class="flex items-center gap-3">
        <button
          class="btn btn-ghost btn-sm btn-circle shrink-0"
          (click)="back.emit()"
          aria-label="Go back"
        >
          <ng-icon name="heroChevronLeft" size="1.25rem" />
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold tracking-tight truncate">{{ title() }}</h1>
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
          <ng-icon name="heroExclamationCircle" size="1.25rem" class="shrink-0" />
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
