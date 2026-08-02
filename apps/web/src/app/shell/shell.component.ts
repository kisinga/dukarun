import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Company, SupabaseService } from '../core/supabase.service';
import { ThemeService } from '../core/theme.service';
import { ApprovalsService } from '../approvals/approvals.service';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  badge?: () => number;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Authenticated app shell (v1 pattern): sticky top navbar + daisyUI drawer —
 * sidebar always open on desktop, slide-over on mobile — plus a mobile
 * bottom tab bar for the core destinations.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  template: `
    <div class="drawer lg:drawer-open">
      <input id="app-drawer" type="checkbox" class="drawer-toggle" />

      <div class="drawer-content flex min-h-screen flex-col">
        <!-- Top navbar -->
        <div class="navbar sticky top-0 z-40 min-h-16 border-b border-base-300 bg-base-100 px-4">
          <div class="flex-none lg:hidden">
            <label for="app-drawer" class="btn btn-square btn-ghost btn-sm" aria-label="Open menu">
              <ng-icon name="heroBars3" size="1.25rem" />
            </label>
          </div>

          <div class="flex min-w-0 flex-1 items-center gap-2.5 px-2">
            <div class="avatar">
              <div class="h-8 w-8 rounded-lg ring-1 ring-base-300/50">
                <img src="/assets/logo/dukarun-icon-dark.svg" alt="Dukarun" />
              </div>
            </div>
            <span class="truncate text-sm font-bold">{{ company()?.name ?? 'Dukarun' }}</span>
          </div>

          <div class="flex flex-none items-center gap-1.5">
            <!-- Till status -->
            <a
              routerLink="/money/cashier"
              class="badge badge-md min-h-0 cursor-pointer gap-1.5 border-0 px-3 py-2 font-semibold"
              [class.badge-success]="tillOpen()"
              [class.badge-ghost]="!tillOpen()"
              [title]="tillOpen() ? 'Till open — cashier sessions' : 'No open till'"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                [class.bg-success]="tillOpen()"
                [class.animate-pulse]="tillOpen()"
                [class.bg-base-content/30]="!tillOpen()"
              ></span>
              {{ tillOpen() ? 'till open' : 'till closed' }}
            </a>

            <button
              class="btn btn-ghost btn-sm min-h-11 min-w-11"
              [title]="theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
              (click)="theme.toggle()"
            >
              <ng-icon [name]="theme.theme() === 'light' ? 'heroMoon' : 'heroSun'" />
            </button>
            <button class="btn btn-ghost btn-sm min-h-11" title="Sign out" (click)="signOut()">
              <ng-icon name="heroArrowRightOnRectangle" />
            </button>
          </div>
        </div>

        <!-- Page content -->
        <main class="flex-1 overflow-auto bg-base-200/40 pb-20 lg:pb-0">
          <router-outlet />
        </main>

        <!-- Mobile bottom tab bar -->
        <nav
          class="fixed bottom-0 left-0 right-0 z-50 border-t border-base-300 bg-base-100 lg:hidden"
          role="navigation"
        >
          <div class="flex h-14 items-center justify-around px-2">
            <a
              routerLink="/dashboard"
              routerLinkActive="bottom-nav-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="bottom-nav-item"
            >
              <span class="bottom-nav-ico"><ng-icon name="heroHome" size="1.25rem" /></span>
              <span class="bottom-nav-label">Home</span>
            </a>
            <a routerLink="/pos/sell" routerLinkActive="bottom-nav-active" class="bottom-nav-item">
              <span class="bottom-nav-ico"><ng-icon name="heroShoppingCart" size="1.25rem" /></span>
              <span class="bottom-nav-label">Sell</span>
            </a>
            <a routerLink="/pos/sales" routerLinkActive="bottom-nav-active" class="bottom-nav-item">
              <span class="bottom-nav-ico"><ng-icon name="heroBanknotes" size="1.25rem" /></span>
              <span class="bottom-nav-label">Sales</span>
            </a>
            <a routerLink="/orders" routerLinkActive="bottom-nav-active" class="bottom-nav-item">
              <span class="bottom-nav-ico"
                ><ng-icon name="heroClipboardDocumentList" size="1.25rem"
              /></span>
              <span class="bottom-nav-label">Orders</span>
            </a>
            <label for="app-drawer" class="bottom-nav-item cursor-pointer">
              <span class="bottom-nav-ico"><ng-icon name="heroBars3" size="1.25rem" /></span>
              <span class="bottom-nav-label">More</span>
            </label>
          </div>
        </nav>
      </div>

      <!-- Sidebar -->
      <div class="drawer-side z-50">
        <label
          for="app-drawer"
          class="drawer-overlay bg-base-content/50"
          aria-label="Close menu"
        ></label>
        <aside class="flex min-h-screen w-64 flex-col border-r border-base-300 bg-base-100">
          <div class="flex min-h-16 items-center gap-2.5 border-b border-base-300 px-4">
            <img src="/assets/logo/dukarun-icon-dark.svg" alt="Dukarun" class="h-8 w-8" />
            <span class="truncate text-sm font-bold">{{ company()?.name ?? 'Dukarun' }}</span>
          </div>

          <div class="flex-1 overflow-y-auto px-2 py-2">
            <nav class="space-y-1">
              @for (section of sections; track section.label ?? 'top') {
                @if (section.label) {
                  <div
                    class="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-base-content/40"
                  >
                    {{ section.label }}
                  </div>
                }
                @for (item of section.items; track item.route) {
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="nav-item-active"
                    [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
                    (click)="closeDrawer()"
                    class="nav-item"
                  >
                    <ng-icon [name]="item.icon" />
                    <span class="flex-1">{{ item.label }}</span>
                    @if (item.badge && item.badge() > 0) {
                      <span class="badge badge-warning badge-sm">{{ item.badge() }}</span>
                    }
                  </a>
                }
              }
            </nav>
          </div>

          <div class="border-t border-base-300 p-2">
            <a
              routerLink="/settings"
              routerLinkActive="nav-item-active"
              (click)="closeDrawer()"
              class="nav-item"
            >
              <ng-icon name="heroCog6Tooth" />
              <span>Settings</span>
            </a>
            <div class="mt-1 text-center text-xs text-base-content/30">v2.0.0</div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class ShellComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly approvals = inject(ApprovalsService);

  protected readonly company = signal<Company | null>(null);
  protected readonly tillOpen = signal(false);

  protected readonly sections: NavSection[] = [
    {
      items: [
        { route: '/dashboard', label: 'Dashboard', icon: 'heroHome' },
        { route: '/reports', label: 'Reports', icon: 'heroChartBar' },
      ],
    },
    {
      label: 'Sell',
      items: [
        { route: '/pos/sell', label: 'Sell', icon: 'heroShoppingCart' },
        { route: '/pos/sales', label: "Today's Sales", icon: 'heroBanknotes' },
        { route: '/pos/proformas', label: 'Proformas', icon: 'heroClipboardDocumentList' },
        { route: '/pos/cashier', label: 'Cashier Queue', icon: 'heroCreditCard' },
        { route: '/orders', label: 'Orders', icon: 'heroArchiveBox' },
      ],
    },
    {
      label: 'Manage',
      items: [
        { route: '/products', label: 'Products', icon: 'heroCube' },
        { route: '/customers', label: 'Customers', icon: 'heroUsers' },
        { route: '/team', label: 'Team', icon: 'heroUserGroup' },
        {
          route: '/approvals',
          label: 'Approvals',
          icon: 'heroCheckBadge',
          badge: () => this.approvals.pending().length,
        },
      ],
    },
    {
      label: 'Money',
      items: [
        { route: '/money/cashier', label: 'Cashier Sessions', icon: 'heroBanknotes' },
        { route: '/money/expenses', label: 'Expenses', icon: 'heroBanknotes' },
        { route: '/money/transfers', label: 'Transfers', icon: 'heroArrowsRightLeft' },
        { route: '/money/credit', label: 'Customer Credit', icon: 'heroUsers' },
        { route: '/money/suppliers', label: 'Suppliers', icon: 'heroTruck' },
        { route: '/money/periods', label: 'Reconciliation', icon: 'heroCalendarDays' },
        { route: '/money/stock', label: 'Stock Adjustments', icon: 'heroCube' },
      ],
    },
  ];

  async ngOnInit(): Promise<void> {
    try {
      this.company.set(await this.supabase.currentCompany());
    } catch {
      // brand falls back to 'Dukarun'
    }
    await this.refreshTill();
    // Light polling keeps the till badge honest without a subscription.
    setInterval(() => void this.refreshTill(), 30_000);
  }

  private async refreshTill(): Promise<void> {
    const { data } = await this.supabase.client
      .from('cashier_sessions')
      .select('id')
      .eq('status', 'open')
      .limit(1);
    this.tillOpen.set((data?.length ?? 0) > 0);
  }

  protected closeDrawer(): void {
    const toggle = document.getElementById('app-drawer') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }

  protected async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
