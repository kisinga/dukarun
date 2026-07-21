import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppIconComponent } from '../icon/app-icon.component';

/**
 * Empty state component
 *
 * Consistent empty state display across all dashboard pages.
 * Shows icon, title, description, and an optional primary CTA
 * (`ctaLabel` + `ctaLink` for a route, or `ctaLabel` + `(ctaClick)` for an action).
 * Extra buttons (e.g. "Clear filters") can be projected via the `[actions]` slot.
 *
 * Set `embedded` when the empty state lives inside an existing card or plain
 * container — it drops the card wrapper so cards don't nest.
 *
 * ```html
 * <app-empty-state
 *   icon="heroUsers"
 *   title="No customers found"
 *   description="Get started by adding your first customer."
 *   ctaLabel="Add Customer"
 *   ctaLink="/dashboard/customers/create"
 * />
 * ```
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class.card]="!embedded()" [class.bg-base-100]="!embedded()">
      <div [class.card-body]="!embedded()">
        <div class="text-center py-12 lg:py-16 px-4">
          <div
            class="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 rounded-full bg-base-200 flex items-center justify-center"
          >
            @if (icon()) {
              <app-icon [name]="icon()!" size="xl" class="text-base-content/30" />
            } @else {
              <ng-content select="[icon]"></ng-content>
            }
          </div>
          <h3 class="text-lg font-semibold">{{ title() }}</h3>
          @if (description()) {
            <p class="text-sm text-base-content/60 mt-2 max-w-md mx-auto">
              {{ description() }}
            </p>
          }

          <div class="flex gap-2 justify-center mt-6 empty:hidden">
            <ng-content select="[actions]"></ng-content>

            @if (ctaLabel() && ctaLink()) {
              <a [routerLink]="ctaLink()" class="btn btn-primary btn-sm lg:btn-md gap-2">
                @if (showCtaIcon()) {
                  <app-icon name="heroPlus" />
                }
                {{ ctaLabel() }}
              </a>
            } @else if (ctaLabel()) {
              <button (click)="ctaClick.emit()" class="btn btn-primary btn-sm lg:btn-md gap-2">
                @if (showCtaIcon()) {
                  <app-icon name="heroPlus" />
                }
                {{ ctaLabel() }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  /** Registered icon key (shared/icons/app-icons.ts), rendered decoratively at 40px. */
  readonly icon = input<string>();
  readonly title = input.required<string>();
  readonly description = input<string>();
  /** Label for the primary CTA; renders a routerLink anchor when `ctaLink` is set, else a button emitting `ctaClick`. */
  readonly ctaLabel = input<string>();
  readonly ctaLink = input<string | string[]>();
  /** Show the leading plus icon on the primary CTA. */
  readonly showCtaIcon = input(true);
  /** Drop the card wrapper (for empty states inside an existing card or plain container). */
  readonly embedded = input(false);

  readonly ctaClick = output<void>();
}
