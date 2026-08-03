import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { IconComponent } from '../shared/ui/icon.component';

interface MoneyTab {
  route: string;
  label: string;
  icon: string;
}

/**
 * Money hub layout — one persistent tab strip across all /money/* screens
 * (scrollable on mobile). The tabs ARE the navigation; no per-page back links.
 */
@Component({
  selector: 'app-money-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageLayoutComponent, IconComponent],
  template: `
    <app-page
      title="Money"
      subtitle="Track balances, cashier sessions, credit, expenses, transfers, and accounting periods."
      [wide]="true"
    >
      <div
        role="tablist"
        aria-label="Money sections"
        class="tabs tabs-boxed scroll-fade-r mb-4 w-full flex-nowrap gap-1 overflow-x-auto border border-base-300/70 bg-base-100 p-1"
      >
        @for (tab of tabs; track tab.route) {
          <a
            role="tab"
            class="tab min-h-11 shrink-0 gap-2 px-4"
            [routerLink]="tab.route"
            routerLinkActive="tab-active"
          >
            <app-icon [name]="tab.icon" />
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
    { route: '/money/ledger', label: 'Ledger', icon: 'heroDocumentText' },
    { route: '/money/cashier', label: 'Cashier', icon: 'heroBanknotes' },
    { route: '/money/credit', label: 'Credit', icon: 'heroCreditCard' },
    { route: '/money/expenses', label: 'Expenses', icon: 'heroReceiptRefund' },
    { route: '/money/transfers', label: 'Transfers', icon: 'heroArrowsRightLeft' },
    { route: '/money/periods', label: 'Periods', icon: 'heroCalendarDays' },
  ];
}
