import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

/**
 * Standard page header (The Counter — type roles, one primary action).
 * Title left (+ optional back link and subtitle), `[actions]` slot right.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, NgIcon],
  template: `
    <div class="mb-4 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div class="min-w-0">
        @if (backLink(); as link) {
          <a
            [routerLink]="link"
            class="btn btn-ghost btn-sm -ml-2 mb-1 gap-1"
            [attr.aria-label]="backLabel()"
          >
            <ng-icon name="heroChevronLeft" />
            {{ backLabel() }}
          </a>
        }
        <h1 class="type-title truncate">
          {{ title() }}
          @if (badge(); as b) {
            <span class="badge badge-warning ml-1 align-middle">{{ b }}</span>
          }
        </h1>
        @if (subtitle()) {
          <p class="mt-0.5 text-sm text-base-content/60">{{ subtitle() }}</p>
        }
      </div>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <ng-content select="[actions]"></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Optional count badge next to the title (e.g. pending items). */
  readonly badge = input<string | number>();
  /** Route for the back affordance (e.g. '/dashboard'). */
  readonly backLink = input<string | string[]>();
  readonly backLabel = input('Back');
}
