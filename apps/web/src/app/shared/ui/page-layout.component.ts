import { Component, input } from '@angular/core';
import { PageHeaderComponent } from './page-header.component';

/**
 * Page shell (The Counter — one content wrapper, one header).
 * Owns the `dashboard-main` + `.page` scaffolding so pages compose content only.
 * Pass `title` for the standard header and project header actions into `[actions]`.
 */
@Component({
  selector: 'app-page',
  imports: [PageHeaderComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page" [class.page-wide]="wide()">
        @if (title(); as t) {
          <app-page-header
            [title]="t"
            [subtitle]="subtitle()"
            [badge]="badge()"
            [backLink]="backLink()"
            [backLabel]="backLabel()"
          >
            <ng-content select="[actions]"></ng-content>
          </app-page-header>
        }
        <ng-content></ng-content>
      </div>
    </main>
  `,
})
export class PageLayoutComponent {
  /** Page title; omit to render content without a header. */
  readonly title = input<string>();
  readonly subtitle = input<string>();
  /** Optional count badge next to the title (e.g. pending items). */
  readonly badge = input<string | number>();
  /** Route for the back affordance (e.g. '/dashboard'). */
  readonly backLink = input<string | string[]>();
  readonly backLabel = input('Back');
  /** Widen the content wrapper to max-w-7xl (dashboard, reports, dense tables). */
  readonly wide = input(false);
}
