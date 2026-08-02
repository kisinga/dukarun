import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

/**
 * Empty state (The Counter — "speak like a person, not a system log").
 * Two sizes: the hero block for truly-empty first-run pages, and `compact`
 * (one quiet line) for in-card / partial-empty use. Optional CTA via
 * `ctaLink` or `(ctaClick)`; `embedded` drops the card wrapper.
 */
@Component({
  selector: 'app-empty-state',
  imports: [RouterLink, NgIcon],
  template: `
    @if (compact()) {
      <div class="flex items-center gap-3 px-4 py-4">
        <ng-icon [name]="icon()" size="1.25rem" class="shrink-0 text-base-content/30" />
        <div class="min-w-0 flex-1">
          <span class="text-sm font-medium text-base-content/70">{{ title() }}</span>
          @if (description()) {
            <span class="ml-1 text-sm text-base-content/50">{{ description() }}</span>
          }
        </div>
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
    } @else {
      <div [class.card]="!embedded()" [class.bg-base-100]="!embedded()">
        <div [class.card-body]="!embedded()">
          <div class="px-4 py-12 text-center">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200"
            >
              <ng-icon [name]="icon()" size="2.5rem" class="text-base-content/30" />
            </div>
            <h3 class="type-heading">{{ title() }}</h3>
            @if (description()) {
              <p class="mx-auto mt-2 max-w-md text-sm text-base-content/60">
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
                <button
                  type="button"
                  class="btn btn-primary btn-sm gap-2"
                  (click)="ctaClick.emit()"
                >
                  <ng-icon name="heroPlus" />
                  {{ ctaLabel() }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
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
  /** One quiet line instead of the hero block — for in-card/partial empties. */
  readonly compact = input(false);

  readonly ctaClick = output<void>();
}
