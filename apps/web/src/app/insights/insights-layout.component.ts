import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { PermissionsService } from '../core/permissions.service';
import { IconComponent } from '../shared/ui/icon.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';

@Component({
  selector: 'app-insights-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageLayoutComponent, IconComponent],
  template: `
    <app-page [title]="activeLabel()" [subtitle]="subtitle()" [wide]="true">
      @if (notice()) {
        <div role="status" class="alert alert-info mb-4 py-2 text-sm">
          <app-icon name="heroInformationCircle" />
          <span>{{ notice() }}</span>
        </div>
      }
      <label class="form-control mb-3 md:hidden">
        <span
          class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
          >Insights section</span
        >
        <select
          class="select select-bordered min-h-11 w-full"
          [value]="activeRoute()"
          (change)="navigate($event)"
        >
          @for (tab of visibleTabs(); track tab.route) {
            <option [value]="tab.route">{{ tab.label }}</option>
          }
        </select>
      </label>
      <nav aria-label="Insights sections" class="section-tabs mb-4 hidden md:flex">
        @for (tab of visibleTabs(); track tab.route) {
          <a
            class="section-tab"
            [routerLink]="tab.route"
            routerLinkActive="section-tab-active"
            ariaCurrentWhenActive="page"
          >
            <app-icon [name]="tab.icon" />{{ tab.label }}
          </a>
        }
      </nav>
      <router-outlet />
    </app-page>
  `,
})
export class InsightsLayoutComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionsService);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)),
    {
      initialValue: null,
    }
  );
  private readonly tabs = [
    {
      route: '/insights/attention',
      label: 'Attention',
      icon: 'heroExclamationTriangle',
      financeOnly: false,
    },
    { route: '/insights/credit', label: 'Credit', icon: 'heroCreditCard', financeOnly: true },
    { route: '/insights/inventory', label: 'Inventory', icon: 'heroCube', financeOnly: false },
    {
      route: '/insights/sales',
      label: 'Sales',
      icon: 'heroChartBar',
      financeOnly: true,
    },
  ] as const;
  protected readonly visibleTabs = computed(() =>
    this.tabs.filter(tab => !tab.financeOnly || this.permissions.has('ViewFinancials'))
  );
  protected readonly activeRoute = computed(() => {
    this.navigation();
    if (this.router.url.startsWith('/insights/products')) return '/insights/inventory';
    if (this.router.url.startsWith('/insights/performance')) return '/insights/sales';
    return (
      this.tabs.find(tab => this.router.url.startsWith(tab.route))?.route ?? '/insights/attention'
    );
  });
  protected readonly activeLabel = computed(
    () => this.tabs.find(tab => tab.route === this.activeRoute())?.label ?? 'Insights'
  );
  protected readonly subtitle = computed(() => {
    if (this.activeRoute().includes('/credit'))
      return 'Payment behaviour, exposure, and advisory credit decisions.';
    if (this.activeRoute().includes('/inventory'))
      return 'Stock priorities, source performance, valuation, and replenishment decisions.';
    if (this.activeRoute().includes('/sales'))
      return 'Sales results and customer contribution for the selected period.';
    return 'Prioritised credit and stock issues that need a decision.';
  });
  protected readonly notice = computed(() => {
    this.navigation();
    return this.route.snapshot.queryParamMap.get('notice');
  });

  protected navigate(event: Event): void {
    void this.router.navigateByUrl((event.target as HTMLSelectElement).value);
  }
}
