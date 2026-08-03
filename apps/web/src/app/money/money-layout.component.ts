import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageLayoutComponent],
  template: `
    <app-page title="Money">
      <div
        role="tablist"
        class="tabs tabs-boxed scroll-fade-r mb-4 w-full flex-nowrap overflow-x-auto"
      >
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
    </app-page>
  `,
})
export class MoneyLayoutComponent {
  protected readonly tabs: MoneyTab[] = [
    { route: '/money/ledger', label: 'Ledger' },
    { route: '/money/cashier', label: 'Cashier' },
    { route: '/money/expenses', label: 'Expenses' },
    { route: '/money/transfers', label: 'Transfers' },
    { route: '/money/periods', label: 'Periods' },
  ];
}
