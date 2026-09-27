import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { PermissionsService } from '../core/permissions.service';
import { IconComponent } from '../shared/ui/icon.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { RouteNavigationComponent } from '../shared/ui/route-navigation.component';

@Component({
  selector: 'app-insights-layout',
  imports: [RouterOutlet, PageLayoutComponent, IconComponent, RouteNavigationComponent],
  template: `
    <app-page [title]="activeLabel() + ' insights'" [subtitle]="subtitle()" [wide]="true">
      @if (notice()) {
        <div role="status" class="alert alert-info mb-4 py-2 text-sm">
          <app-icon name="heroInformationCircle" />
          <span>{{ notice() }}</span>
        </div>
      }
      <app-route-navigation [items]="visibleTabs()" label="Insights" />
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
      this.tabs.find(tab => this.router.url.startsWith(tab.route))?.route ?? '/insights/inventory'
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
    return 'Stock priorities, source performance, valuation, and replenishment decisions.';
  });
  protected readonly notice = computed(() => {
    this.navigation();
    return this.route.snapshot.queryParamMap.get('notice');
  });
}
