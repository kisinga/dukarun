import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Empty state component
 *
 * Consistent empty state display across all dashboard pages.
 * Shows icon, title, description, and optional CTA.
 */
@Component({
    selector: 'app-empty-state',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="text-center py-12 lg:py-16 px-4">
          <div
            class="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 rounded-full bg-base-200 flex items-center justify-center"
          >
            <ng-content select="[icon]"></ng-content>
          </div>
          <h3 class="text-lg font-semibold">{{ title() }}</h3>
          @if (description()) {
            <p class="text-sm text-base-content/60 mt-2 max-w-md mx-auto">
              {{ description() }}
            </p>
          }

          <div class="flex gap-2 justify-center mt-6">
            <ng-content select="[actions]"></ng-content>

            @if (ctaLabel() && ctaLink()) {
              <a [routerLink]="ctaLink()" class="btn btn-primary btn-sm lg:btn-md gap-2">
                @if (showCtaIcon()) {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                }
                {{ ctaLabel() }}
              </a>
            } @else if (ctaLabel()) {
              <button (click)="ctaClick.emit()" class="btn btn-primary btn-sm lg:btn-md gap-2">
                @if (showCtaIcon()) {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
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
    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly ctaLabel = input<string>();
    readonly ctaLink = input<string | string[]>();
    readonly showCtaIcon = input(true);

    readonly ctaClick = output<void>();
}

