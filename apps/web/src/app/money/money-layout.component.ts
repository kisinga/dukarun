import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import {
  RouteNavigationComponent,
  type RouteNavigationItem,
} from '../shared/ui/route-navigation.component';

/**
 * Money hub layout — one persistent route-navigation row across all /money/* screens.
 * The section navigation is the wayfinding; child pages do not add back links.
 */
@Component({
  selector: 'app-money-layout',
  imports: [RouterOutlet, PageLayoutComponent, RouteNavigationComponent],
  template: `
    <app-page
      [title]="activeLabel()"
      subtitle="Track balances, cashier sessions, credit, expenses, transfers, and accounting periods."
      [wide]="true"
    >
      <app-route-navigation [items]="tabs" label="Money" />
      <router-outlet />
    </app-page>
  `,
})
export class MoneyLayoutComponent {
  private readonly router = inject(Router);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)),
    { initialValue: null }
  );
  protected readonly tabs: readonly RouteNavigationItem[] = [
    { route: '/money/ledger', label: 'Ledger', icon: 'heroDocumentText' },
    { route: '/money/cashier', label: 'Cashier', icon: 'heroBanknotes' },
    { route: '/money/expenses', label: 'Expenses', icon: 'heroReceiptRefund' },
    { route: '/money/transfers', label: 'Transfers', icon: 'heroArrowsRightLeft' },
    { route: '/money/reconcile', label: 'Reconcile', icon: 'heroCheckBadge' },
    { route: '/money/vat', label: 'VAT', icon: 'heroReceiptPercent' },
    { route: '/money/periods', label: 'Periods', icon: 'heroCalendarDays' },
  ];
  protected readonly activeRoute = computed(() => {
    this.navigation();
    return (
      this.tabs.find(tab => this.router.url.startsWith(tab.route))?.route ?? this.tabs[0].route
    );
  });
  protected readonly activeLabel = computed(
    () => this.tabs.find(tab => tab.route === this.activeRoute())?.label ?? 'Money'
  );
}
