import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeaderComponent } from '../shared/ui/page-header.component';

interface MoneyTab {
  route: string;
  label: string;
}

/**
 * Money hub layout — one persistent tab strip across all /money/* screens
 * (scrollable on mobile). The tabs ARE the navigation; no per-page back links.
 */
@Component({
  selector: 'app-money-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeaderComponent],
  template: `
    <app-page-header title="Money" backLink="/dashboard" backLabel="Dashboard" />
    <div role="tablist" class="tabs tabs-boxed mb-4 w-full flex-nowrap overflow-x-auto">
      @for (tab of tabs; track tab.route) {
        <a
          role="tab"
          class="tab min-h-11 shrink-0"
          [routerLink]="tab.route"
          routerLinkActive="tab-active"
        >
          {{ tab.label }}
        </a>
      }
    </div>
    <router-outlet />
  `,
})
export class MoneyLayoutComponent {
  protected readonly tabs: MoneyTab[] = [
    { route: '/money/cashier', label: 'Cashier' },
    { route: '/money/expenses', label: 'Expenses' },
    { route: '/money/transfers', label: 'Transfers' },
    { route: '/money/credit', label: 'Credit' },
    { route: '/money/suppliers', label: 'Suppliers' },
    { route: '/money/periods', label: 'Periods' },
    { route: '/money/stock', label: 'Stock' },
  ];
}
