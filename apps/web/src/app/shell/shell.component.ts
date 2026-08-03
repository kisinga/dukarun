import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Company, SupabaseService } from '../core/supabase.service';
import { PermissionsService } from '../core/permissions.service';
import { ThemeService } from '../core/theme.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { SyncService } from '../pos/offline/sync.service';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  badge?: () => number;
  /** Permission predicate — item renders only when it returns true. */
  visible?: () => boolean;
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

          <!-- Page titles live in the pages; the navbar stays out of the way. -->
          <div class="flex-1"></div>

          <div class="flex flex-none items-center gap-1.5">
            @if (pendingSyncCount() > 0 || sync.syncing()) {
              <a
                routerLink="/pos/sync"
                class="btn btn-square btn-ghost btn-sm indicator min-h-11 min-w-11"
                [title]="syncStatusLabel()"
                [attr.aria-label]="syncStatusLabel()"
              >
                <ng-icon
                  [name]="
                    sync.syncing()
                      ? 'heroArrowPath'
                      : sync.failedCount() > 0
                        ? 'heroExclamationTriangle'
                        : 'heroArrowPath'
                  "
                  size="1.25rem"
                  [class.animate-spin]="sync.syncing()"
                  [class.text-error]="sync.failedCount() > 0"
                  [class.text-warning]="sync.failedCount() === 0"
                />
                @if (pendingSyncCount() > 0) {
                  <span
                    class="badge indicator-item badge-xs"
                    [class.badge-error]="sync.failedCount() > 0"
                    [class.badge-warning]="sync.failedCount() === 0"
                  >
                    {{ pendingSyncCount() }}
                  </span>
                }
              </a>
            }

            <!-- Notifications -->
            <a
              routerLink="/notifications"
              class="btn btn-square btn-ghost btn-sm indicator min-h-11 min-w-11"
              title="Notifications"
            >
              <ng-icon name="heroBell" size="1.25rem" />
              @if (notifications.unreadCount() > 0) {
                <span class="badge indicator-item badge-primary badge-xs">
                  {{ notifications.unreadCount() }}
                </span>
              }
            </a>

            <!-- Till status -->
            <a
              routerLink="/money/cashier"
              class="badge badge-md min-h-0 cursor-pointer gap-1.5 border-0 px-3 py-2 font-semibold"
              [class.badge-success]="cashierSession.isOpen()"
              [class.badge-ghost]="!cashierSession.isOpen()"
              [title]="cashierSession.isOpen() ? 'Till open — cashier sessions' : 'No open till'"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                [class.bg-success]="cashierSession.isOpen()"
                [class.animate-pulse]="cashierSession.isOpen()"
                [class.bg-base-content/30]="!cashierSession.isOpen()"
              ></span>
              {{ cashierSession.isOpen() ? 'till open' : 'till closed' }}
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
          class="fixed bottom-0 left-0 right-0 z-50 border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
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
            <a routerLink="/sales" routerLinkActive="bottom-nav-active" class="bottom-nav-item">
              <span class="bottom-nav-ico"
                ><ng-icon name="heroClipboardDocumentList" size="1.25rem"
              /></span>
              <span class="bottom-nav-label">Sales</span>
            </a>
            <a
              routerLink="/money/cashier"
              routerLinkActive="bottom-nav-active"
              class="bottom-nav-item"
            >
              <span class="bottom-nav-ico"><ng-icon name="heroBanknotes" size="1.25rem" /></span>
              <span class="bottom-nav-label">Money</span>
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
        <aside class="flex min-h-screen w-64 flex-col border-r border-base-300 bg-base-200">
          <div class="flex min-h-16 items-center gap-2.5 border-b border-base-300 px-4">
            <img src="/assets/logo/dukarun-icon-dark.svg" alt="Dukarun" class="h-8 w-8" />
            <span class="truncate text-sm font-bold">{{ company()?.name ?? 'Dukarun' }}</span>
          </div>

          <div class="flex-1 overflow-y-auto px-2 py-2">
            <nav class="space-y-1">
              @for (section of visibleSections(); track section.label ?? 'top') {
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
  protected readonly perms = inject(PermissionsService);
  protected readonly approvals = inject(ApprovalsService);
  protected readonly notifications = inject(NotificationsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly sync = inject(SyncService);

  protected readonly company = signal<Company | null>(null);
  protected readonly pendingSyncCount = computed(
    () => this.sync.queuedCount() + this.sync.failedCount()
  );

  protected readonly sections: NavSection[] = [
    {
      items: [{ route: '/dashboard', label: 'Dashboard', icon: 'heroHome' }],
    },
    {
      label: 'Operations',
      items: [
        { route: '/pos/sell', label: 'Sell', icon: 'heroShoppingCart' },
        { route: '/pos/cashier', label: 'Cashier Queue', icon: 'heroQueueList' },
        { route: '/sales', label: 'Sales', icon: 'heroClipboardDocumentList' },
        { route: '/pos/proformas', label: 'Proformas', icon: 'heroDocumentText' },
        { route: '/products', label: 'Products', icon: 'heroCube' },
        { route: '/purchases', label: 'Purchases', icon: 'heroTruck' },
        {
          route: '/stock-adjustments',
          label: 'Stock Adjustments',
          icon: 'heroArchiveBox',
          visible: () => this.perms.has('ManageStockAdjustments'),
        },
      ],
    },
    {
      label: 'Finance',
      items: [
        {
          route: '/money/cashier',
          label: 'Money',
          icon: 'heroBanknotes',
          visible: () => this.perms.has('ViewFinancials'),
        },
        {
          route: '/reports',
          label: 'Reports',
          icon: 'heroChartBar',
          visible: () => this.perms.has('ViewFinancials'),
        },
        {
          route: '/approvals',
          label: 'Approvals',
          icon: 'heroCheckBadge',
          badge: () => this.approvals.pending().length,
          visible: () => this.perms.has('ManageApprovals'),
        },
      ],
    },
    {
      label: 'People',
      items: [
        { route: '/customers', label: 'Customers', icon: 'heroUsers' },
        { route: '/suppliers', label: 'Suppliers', icon: 'heroTruck' },
        {
          route: '/team',
          label: 'Team',
          icon: 'heroUserGroup',
          visible: () => this.perms.has('ManageTeam'),
        },
        { route: '/messaging', label: 'Messaging', icon: 'heroChatBubbleLeftRight' },
      ],
    },
  ];

  /** Sections with invisible items filtered out; empty sections dropped. */
  protected readonly visibleSections = computed(() =>
    this.sections
      .map(s => ({ ...s, items: s.items.filter(i => !i.visible || i.visible()) }))
      .filter(s => s.items.length > 0)
  );

  protected syncStatusLabel(): string {
    if (this.sync.syncing()) return 'Syncing offline sales';
    if (this.sync.failedCount() > 0) {
      const count = this.sync.failedCount();
      return `${count} sale${count === 1 ? '' : 's'} failed to sync`;
    }
    const count = this.sync.queuedCount();
    return `${count} sale${count === 1 ? '' : 's'} waiting to sync`;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.company.set(await this.supabase.currentCompany());
    } catch {
      // brand falls back to 'Dukarun'
    }
    await this.cashierSession.start();
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
