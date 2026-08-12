import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
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
      [title]="activeLabel()"
      subtitle="Track balances, cashier sessions, credit, expenses, transfers, and accounting periods."
      [wide]="true"
    >
      <label class="form-control mb-3 md:hidden">
        <span
          class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
        >
          Money section
        </span>
        <select
          class="select select-bordered min-h-11 w-full"
          aria-label="Money section"
          [value]="activeRoute()"
          (change)="navigateSection($event)"
        >
          @for (tab of tabs; track tab.route) {
            <option [value]="tab.route">{{ tab.label }}</option>
          }
        </select>
      </label>
      <div
        role="tablist"
        aria-label="Money sections"
        class="tabs tabs-boxed mb-4 hidden w-full gap-1 border border-base-300/70 bg-base-100 p-1 md:flex"
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
  private readonly router = inject(Router);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)),
    { initialValue: null }
  );
  protected readonly tabs: MoneyTab[] = [
    { route: '/money/ledger', label: 'Ledger', icon: 'heroDocumentText' },
    { route: '/money/cashier', label: 'Cashier', icon: 'heroBanknotes' },
    { route: '/money/credit', label: 'Credit', icon: 'heroCreditCard' },
    { route: '/money/expenses', label: 'Expenses', icon: 'heroReceiptRefund' },
    { route: '/money/transfers', label: 'Transfers', icon: 'heroArrowsRightLeft' },
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

  protected navigateSection(event: Event): void {
    void this.router.navigateByUrl((event.target as HTMLSelectElement).value);
  }
}
