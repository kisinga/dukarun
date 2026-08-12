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
    <header class="mb-7 flex flex-wrap items-end gap-x-6 gap-y-4">
      <div class="min-w-0 flex-1">
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
        @if (eyebrow()) {
          <p class="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-primary/80">
            {{ eyebrow() }}
          </p>
        }
        <h1 class="type-title">
          {{ title() }}
          @if (badge(); as b) {
            <span class="badge badge-warning ml-1 align-middle">{{ b }}</span>
          }
        </h1>
        @if (subtitle()) {
          <p class="mt-1 max-w-3xl text-sm leading-relaxed text-base-content/58">
            {{ subtitle() }}
          </p>
        }
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <ng-content select="[actions]"></ng-content>
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly eyebrow = input('Superadmin');
  /** Optional count badge next to the title (e.g. pending items). */
  readonly badge = input<string | number>();
  /** Route for the back affordance (e.g. '/dashboard'). */
  readonly backLink = input<string | string[]>();
  readonly backLabel = input('Back');
}
