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
    <div class="page-header mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
      <div class="min-w-0 self-center">
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
          @if (badge() !== undefined && badge() !== null) {
            <span
              class="badge ml-1 align-middle"
              [class.badge-ghost]="badge() === 0 || badge() === '0'"
              [class.badge-warning]="badge() !== 0 && badge() !== '0'"
              >{{ badge() }}</span
            >
          }
        </h1>
        @if (subtitle()) {
          <p class="mt-0.5 hidden text-sm text-base-content/60 md:block">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex min-w-0 items-center justify-end gap-2">
        <!-- PageLayout already selects [actions] before forwarding them. Direct users of
             PageHeader project only header actions, so filtering a second time would drop
             forwarded nodes. -->
        <ng-content></ng-content>
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
