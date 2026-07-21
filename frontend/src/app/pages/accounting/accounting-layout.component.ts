import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { PageHeaderComponent } from '../../shared/components/dashboard/page-header.component';

const LEDGER = ['/dashboard/accounting/ledger'];

interface FinanceTab {
  label: string;
  icon: string;
  link: string[];
  queryParams?: Record<string, string>;
  /** Matched against the URL-derived active key (the ledger `?tab` value, or the child route). */
  activeKey: string;
}

/**
 * Single flat navigation for the Finances section — one bar, owner-first labels.
 * Overview/Activity/Accounts/Reconciliation are views of the ledger route
 * (driven by `?tab`); Expenses/Transfers are sibling routes. Collapsing both the
 * old outer [Ledger|Expenses|Transfers] bar and the inner
 * [Overview|Accounts|Transactions|Reconciliation] bar into this one removes the
 * two-level nesting.
 */
const TABS: FinanceTab[] = [
  {
    label: 'Overview',
    icon: 'heroChartBar',
    link: LEDGER,
    queryParams: { tab: 'overview' },
    activeKey: 'overview',
  },
  {
    label: 'Activity',
    icon: 'heroArrowsUpDown',
    link: LEDGER,
    queryParams: { tab: 'transactions' },
    activeKey: 'transactions',
  },
  {
    label: 'Accounts',
    icon: 'heroWallet',
    link: LEDGER,
    queryParams: { tab: 'accounts' },
    activeKey: 'accounts',
  },
  {
    label: 'Expenses',
    icon: 'heroReceiptPercent',
    link: ['/dashboard/accounting/expenses'],
    activeKey: 'expenses',
  },
  {
    label: 'Transfers',
    icon: 'heroArrowPath',
    link: ['/dashboard/accounting/transfers'],
    activeKey: 'transfers',
  },
  {
    label: 'Reconciliation',
    icon: 'heroScale',
    link: LEDGER,
    queryParams: { tab: 'reconciliation' },
    activeKey: 'reconciliation',
  },
];

@Component({
  selector: 'app-accounting-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, NgIcon, PageHeaderComponent],
  templateUrl: './accounting-layout.component.html',
  styleUrl: './accounting-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingLayoutComponent {
  private readonly router = inject(Router);
  protected readonly tabs = TABS;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * One flat active key derived from the URL: `expenses`/`transfers` by route,
   * otherwise the ledger `?tab` value (defaulting to `overview`).
   */
  protected readonly activeKey = computed(() => {
    const url = this.currentUrl();
    if (url.includes('/accounting/expenses')) return 'expenses';
    if (url.includes('/accounting/transfers')) return 'transfers';
    const query = url.split('?')[1] ?? '';
    return new URLSearchParams(query).get('tab') ?? 'overview';
  });
}
