import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

/**
 * Empty state (The Counter — "speak like a person, not a system log").
 * Icon + human message + optional CTA (route via `ctaLink`, or action via
 * `(ctaClick)`). Set `embedded` inside an existing card to drop the wrapper.
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, NgIcon],
  template: `
    <div [class.card]="!embedded()" [class.bg-base-100]="!embedded()">
      <div [class.card-body]="!embedded()">
        <div class="px-4 py-12 text-center sm:py-16">
          <div
            class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-base-300/60 bg-base-200/70"
          >
            <ng-icon [name]="icon()" size="1.75rem" class="text-base-content/35" />
          </div>
          <h3 class="type-heading">{{ title() }}</h3>
          @if (description()) {
            <p class="mx-auto mt-2 max-w-md text-sm text-base-content/70">
              {{ description() }}
            </p>
          }
          <div class="mt-6 flex justify-center gap-2 empty:hidden">
            <ng-content select="[actions]"></ng-content>
            @if (ctaLabel() && ctaLink()) {
              <a [routerLink]="ctaLink()" class="btn btn-primary btn-sm gap-2">
                <ng-icon name="heroPlus" />
                {{ ctaLabel() }}
              </a>
            } @else if (ctaLabel()) {
              <button type="button" class="btn btn-primary btn-sm gap-2" (click)="ctaClick.emit()">
                <ng-icon name="heroPlus" />
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
  /** Registered heroicon key (app.config provideIcons). */
  readonly icon = input('heroArchiveBox');
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly ctaLabel = input<string>();
  readonly ctaLink = input<string | string[]>();
  /** Drop the card wrapper (empty state inside an existing card/container). */
  readonly embedded = input(false);

  readonly ctaClick = output<void>();
}
