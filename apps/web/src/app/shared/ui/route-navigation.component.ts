import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { IconComponent } from './icon.component';

export interface RouteNavigationItem {
  readonly route: string;
  readonly label: string;
  readonly icon?: string;
}

/**
 * Route-level navigation for related sections of one workspace.
 * Desktop uses a quiet navigation row; phones use a labeled selector.
 * In-page modes belong in SectionTabsComponent instead.
 */
@Component({
  selector: 'app-route-navigation',
  imports: [RouterLink, IconComponent],
  host: { class: 'block' },
  template: `
    @if (items().length > 1) {
      <label class="form-control mb-3 md:hidden">
        <span
          class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
        >
          {{ label() }} section
        </span>
        <select
          class="select select-bordered min-h-11 w-full"
          [attr.aria-label]="label() + ' section'"
          [value]="activeRoute()"
          (change)="navigate($event)"
        >
          @for (item of items(); track item.route) {
            <option [value]="item.route">{{ item.label }}</option>
          }
        </select>
      </label>

      <nav
        class="mb-4 hidden flex-wrap gap-1 border-b border-base-300 pb-2 md:flex"
        [attr.aria-label]="label() + ' sections'"
      >
        @for (item of items(); track item.route) {
          <a
            class="nav-item"
            [class.nav-item-active]="activeRoute() === item.route"
            [routerLink]="item.route"
            [attr.aria-current]="activeRoute() === item.route ? 'page' : null"
          >
            @if (item.icon) {
              <app-icon [name]="item.icon" />
            }
            {{ item.label }}
          </a>
        }
      </nav>
    }
  `,
})
export class RouteNavigationComponent {
  private readonly router = inject(Router);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)),
    { initialValue: null }
  );

  readonly items = input.required<readonly RouteNavigationItem[]>();
  readonly label = input.required<string>();

  protected readonly activeRoute = computed(() => {
    this.navigation();
    return (
      this.items().find(item => this.router.url.startsWith(item.route))?.route ??
      this.items()[0]?.route ??
      ''
    );
  });

  protected navigate(event: Event): void {
    const route = (event.target as HTMLSelectElement).value;
    if (route) void this.router.navigateByUrl(route);
  }
}
