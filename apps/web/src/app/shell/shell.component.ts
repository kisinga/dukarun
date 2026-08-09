import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Company, SupabaseService } from '../core/supabase.service';
import { PermissionsService } from '../core/permissions.service';
import { ThemeService } from '../core/theme.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { SyncService } from '../pos/offline/sync.service';
import { IconComponent } from '../shared/ui/icon.component';
import { CashierSessionDialogService } from '../core/cashier-session-dialog.service';
import { CashierSessionModalComponent } from '../money/cashier/cashier-session-modal.component';
import { PersonaSwitcherComponent } from '../shared/ui/persona-switcher.component';
import { OrderQueueCountsService } from '../pos/order-queue-counts.service';
import { QUEUE_LONG_COUNT } from '../pos/queue-aging';
import { EntitlementsService } from '../core/entitlements.service';
import { LocationContextService } from '../core/location-context.service';
import { CompanyContextService } from '../core/company-context.service';
import { ProfileService } from '../profile/profile.service';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { LegalService } from '../legal/legal.service';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  badge?: () => number;
  /** Badge tone override; defaults to `badge-warning`. */
  badgeClass?: () => string;
  /** Permission predicate. The item renders only when it returns true. */
  visible?: () => boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Authenticated app shell (v1 pattern): sticky top navbar and daisyUI drawer.
 * The sidebar is always open on desktop and slides over on mobile. A mobile
 * bottom tab bar for the core destinations.
 */

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    EntityAvatarComponent,
    CashierSessionModalComponent,
    PersonaSwitcherComponent,
  ],
  template: `
    <div class="drawer lg:drawer-open">
      <input id="app-drawer" type="checkbox" class="drawer-toggle" />

      <div class="drawer-content flex min-h-screen flex-col">
        <!-- Top navbar -->
        <div class="navbar sticky top-0 z-40 min-h-16 border-b border-base-300 bg-base-100 px-4">
          <div class="flex-none lg:hidden">
            <label for="app-drawer" class="btn btn-square btn-ghost btn-sm" aria-label="Open menu">
              <app-icon name="heroBars3" size="lg" />
            </label>
          </div>

          <!-- Page titles live in the pages; the navbar stays out of the way. -->
          <div class="flex-1"></div>

          @if (locations.isMultiLocation()) {
            <label class="mr-2 hidden items-center gap-2 sm:flex">
              <span class="text-xs font-medium text-base-content/55">Working location</span>
              <select
                class="select select-bordered select-sm max-w-52"
                [value]="locations.activeId()"
                aria-label="Working location"
                (change)="changeLocation($event)"
              >
                @for (location of locations.locations(); track location.id) {
                  <option [value]="location.id">{{ location.name }}</option>
                }
              </select>
            </label>
          }

          <div class="flex flex-none items-center gap-1.5">
            @if (pendingSyncCount() > 0 || sync.syncing()) {
              <a
                routerLink="/pos/sync"
                class="btn btn-square btn-ghost btn-sm indicator min-h-11 min-w-11"
                [title]="syncStatusLabel()"
                [attr.aria-label]="syncStatusLabel()"
              >
                <app-icon
                  [name]="
                    sync.syncing()
                      ? 'heroArrowPath'
                      : sync.failedCount() > 0
                        ? 'heroExclamationTriangle'
                        : 'heroArrowPath'
                  "
                  size="lg"
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
              aria-label="Notifications"
            >
              <app-icon name="heroBell" size="lg" />
              @if (notifications.unreadCount() > 0) {
                <span class="badge indicator-item badge-primary badge-xs">
                  {{ notifications.unreadCount() }}
                </span>
              }
            </a>

            <!-- Global one-click till action -->
            @if (cashierSession.cashControlEnabled()) {
              <button
                type="button"
                class="btn btn-sm min-h-11 gap-2 px-3"
                [class.btn-primary]="!cashierSession.loading() && !cashierSession.isOpen()"
                [class.btn-success]="!cashierSession.loading() && cashierSession.isOpen()"
                [class.btn-outline]="cashierSession.isOpen()"
                [class.btn-ghost]="cashierSession.loading()"
                [title]="
                  cashierSession.isOpen() ? 'Count and close the till' : 'Count and open the till'
                "
                [attr.aria-label]="
                  cashierSession.isOpen() ? 'Open till closing dialog' : 'Open till opening dialog'
                "
                (click)="cashierDialog.show()"
              >
                <app-icon
                  [name]="
                    cashierSession.loading()
                      ? 'heroArrowPath'
                      : cashierSession.isOpen()
                        ? 'heroLockClosed'
                        : 'heroLockOpen'
                  "
                  [class.animate-spin]="cashierSession.loading()"
                />
                <span class="hidden sm:inline">
                  @if (cashierSession.loading()) {
                    Checking till
                  } @else {
                    {{ cashierSession.isOpen() ? 'Close till' : 'Open till' }}
                  }
                </span>
              </button>
            }

            <button
              class="btn btn-ghost btn-sm min-h-11 min-w-11"
              [title]="theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
              [attr.aria-label]="
                theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
              "
              (click)="theme.toggle()"
            >
              <app-icon [name]="theme.theme() === 'light' ? 'heroMoon' : 'heroSun'" />
            </button>
            <div class="dropdown dropdown-end">
              <button
                type="button"
                class="btn btn-ghost btn-sm min-h-11 gap-2 px-2"
                aria-label="Account menu"
              >
                <app-entity-avatar size="sm" [firstName]="myName()" [imageUrl]="myAvatarUrl()" />
                <app-icon name="heroChevronDown" class="hidden sm:inline" />
              </button>
              <ul
                class="dropdown-content menu menu-sm z-50 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
              >
                <li class="menu-title">{{ myName() }}</li>
                <li>
                  <a routerLink="/profile">
                    <app-icon name="heroUserCircle" />
                    My profile
                  </a>
                </li>
                <li>
                  <a routerLink="/privacy"><app-icon name="heroLockClosed" />Privacy</a>
                </li>
                <li>
                  <a routerLink="/terms"><app-icon name="heroDocumentText" />Terms</a>
                </li>
                <li>
                  <button type="button" [disabled]="sync.syncing()" (click)="requestSignOut()">
                    <app-icon name="heroArrowRightOnRectangle" />
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Page content -->
        <main class="flex-1 overflow-auto bg-base-200/40 pb-20 lg:pb-0">
          @if (legal.status(); as legalStatus) {
            @if (
              legalStatus.required && !legalStatus.accepted && !legalStatus.enforcement_started
            ) {
              <div class="border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="status">
                <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
                  <span>
                    Updated Terms require company acceptance before
                    {{ dateTime(legalStatus.enforcement_at) }}.
                  </span>
                  @if (legalStatus.can_accept) {
                    <a routerLink="/legal/accept" class="btn btn-warning btn-sm min-h-9"
                      >Review Terms</a
                    >
                  } @else {
                    <span class="font-medium">Ask a company administrator to review them.</span>
                  }
                </div>
              </div>
            }
          }
          <router-outlet />
        </main>

        <!-- Mobile bottom tab bar -->
        <nav
          class="fixed bottom-0 left-0 right-0 z-50 border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
          role="navigation"
        >
          <div class="flex h-16 items-stretch justify-around px-4">
            <a
              routerLink="/dashboard"
              routerLinkActive="bottom-nav-active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="bottom-nav-item flex-1 justify-center"
            >
              <span class="bottom-nav-ico"><app-icon name="heroHome" size="lg" /></span>
              <span class="bottom-nav-label">Home</span>
            </a>
            <a
              routerLink="/pos/sell"
              routerLinkActive="bottom-nav-active"
              class="bottom-nav-item flex-1 justify-center"
            >
              <span class="bottom-nav-ico"><app-icon name="heroShoppingCart" size="lg" /></span>
              <span class="bottom-nav-label">Sell</span>
            </a>
            <label
              for="app-drawer"
              class="bottom-nav-item flex-1 cursor-pointer justify-center"
              aria-label="Open menu"
            >
              <span class="bottom-nav-ico"><app-icon name="heroBars3" size="lg" /></span>
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
            @if (companies.isMultiCompany()) {
              <div class="dropdown min-w-0 flex-1">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm w-full justify-between gap-1 px-1"
                  aria-label="Switch company"
                >
                  <span class="truncate text-sm font-bold">{{ company()?.name ?? 'Dukarun' }}</span>
                  <app-icon name="heroChevronDown" size="sm" />
                </button>
                <ul
                  class="dropdown-content menu menu-sm z-50 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
                >
                  @for (c of companies.companies(); track c.company_id) {
                    <li>
                      <button
                        type="button"
                        [disabled]="companies.switching() || c.status !== 'approved'"
                        (click)="switchCompany(c.company_id)"
                      >
                        <span class="flex-1 truncate">{{ c.name }}</span>
                        @if (c.status === 'unapproved') {
                          <span class="badge badge-warning badge-xs">Pending</span>
                        }
                        @if (c.company_id === company()?.id) {
                          <app-icon name="heroCheck" size="sm" />
                        }
                      </button>
                    </li>
                  }
                  <li class="mt-1 border-t border-base-300 pt-1">
                    <a routerLink="/register" (click)="closeDrawer()">
                      <app-icon name="heroPlus" />
                      Add company
                    </a>
                  </li>
                </ul>
              </div>
            } @else {
              <span class="truncate text-sm font-bold">{{ company()?.name ?? 'Dukarun' }}</span>
            }
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
                    <app-icon [name]="item.icon" />
                    <span class="flex-1">{{ item.label }}</span>
                    @if (item.badge && item.badge() > 0) {
                      <span
                        class="badge badge-sm"
                        [class]="item.badgeClass ? item.badgeClass() : 'badge-warning'"
                        >{{ item.badge() }}</span
                      >
                    }
                  </a>
                }
              }
            </nav>
          </div>

          <div class="border-t border-base-300 p-2">
            @if (perms.has('ViewAuditTrail')) {
              <a
                routerLink="/settings/audit-trail"
                routerLinkActive="nav-item-active"
                (click)="closeDrawer()"
                class="nav-item"
              >
                <app-icon name="heroClipboardDocumentList" />
                <span>Audit trail</span>
              </a>
            }
            <a
              routerLink="/settings"
              routerLinkActive="nav-item-active"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="closeDrawer()"
              class="nav-item"
            >
              <app-icon name="heroCog6Tooth" />
              <span>Settings</span>
            </a>
            <div class="mt-1 text-center text-xs text-base-content/30">v2.0.0</div>
          </div>
        </aside>
      </div>

      <app-cashier-session-modal />
      <app-persona-switcher />

      @if (signOutWarning()) {
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
        >
          <div class="modal-box max-w-md">
            <h2 id="signout-title" class="type-heading">Sign out with sales waiting?</h2>
            <p class="mt-2 text-sm text-base-content/70">
              {{ pendingSyncCount() }} sale(s) will remain safely on this device. They are tied to
              this account and will resume syncing only when this account signs in again.
            </p>
            <div class="modal-action">
              <button class="btn btn-ghost" type="button" (click)="signOutWarning.set(false)">
                Stay signed in
              </button>
              <button class="btn btn-warning" type="button" (click)="signOut()">
                Sign out anyway
              </button>
            </div>
          </div>
          <button
            class="modal-backdrop"
            type="button"
            aria-label="Cancel signing out"
            (click)="signOutWarning.set(false)"
          ></button>
        </div>
      }
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
  protected readonly cashierDialog = inject(CashierSessionDialogService);
  protected readonly sync = inject(SyncService);
  protected readonly orderQueueCounts = inject(OrderQueueCountsService);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly locations = inject(LocationContextService);
  protected readonly companies = inject(CompanyContextService);
  protected readonly profile = inject(ProfileService);
  protected readonly legal = inject(LegalService);

  protected readonly myName = computed(() => this.profile.me()?.display_name ?? 'Account');
  protected readonly myAvatarUrl = computed(() =>
    this.profile.avatarUrl(this.profile.me()?.avatar_path)
  );

  protected readonly company = signal<Company | null>(null);
  protected readonly pendingSyncCount = computed(
    () => this.sync.queuedCount() + this.sync.failedCount()
  );
  protected readonly signOutWarning = signal(false);

  constructor() {
    effect(() => {
      const status = this.legal.status();
      if (!status?.required || status.accepted || !status.enforcement_started) return;
      const target = status.can_accept ? '/legal/accept' : '/legal/pending';
      void this.router.navigate([target], { queryParams: { returnUrl: this.router.url } });
    });
  }

  protected readonly sections: NavSection[] = [
    {
      items: [{ route: '/dashboard', label: 'Dashboard', icon: 'heroHome' }],
    },
    {
      label: 'Operations',
      items: [
        { route: '/pos/sell', label: 'Sell', icon: 'heroShoppingCart' },
        {
          route: '/pos/cashier',
          label: 'Cashier Queue',
          icon: 'heroQueueList',
          badge: () => this.orderQueueCounts.cashierQueue(),
          badgeClass: () =>
            this.orderQueueCounts.cashierQueue() >= QUEUE_LONG_COUNT
              ? 'badge-warning'
              : 'badge-ghost',
          visible: () =>
            this.perms.has('SettleOrder') &&
            (this.cashierSession.cashierFlowEnabled() || this.orderQueueCounts.cashierQueue() > 0),
        },
        { route: '/sales', label: 'Sales', icon: 'heroClipboardDocumentList' },
        {
          route: '/pos/proformas',
          label: 'Proformas',
          icon: 'heroDocumentText',
          badge: () => this.orderQueueCounts.proformas(),
        },
        { route: '/products', label: 'Products', icon: 'heroCube' },
        { route: '/purchases', label: 'Purchases', icon: 'heroTruck' },
        {
          route: '/stock-adjustments',
          label: 'Stock Adjustments',
          icon: 'heroArchiveBox',
          visible: () => this.perms.has('ManageStockAdjustments'),
        },
        {
          route: '/stock-transfers',
          label: 'Stock Transfers',
          icon: 'heroArrowsRightLeft',
          visible: () =>
            this.perms.has('ManageStockAdjustments') && this.locations.isMultiLocation(),
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
          visible: () => this.perms.has('ManageApprovals') || this.perms.has('ViewFinancials'),
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
        {
          route: '/staff-performance',
          label: 'Staff Performance',
          icon: 'heroChartBar',
          visible: () =>
            this.perms.has('ViewStaffPerformance') && this.entitlements.enabled('staffPerformance'),
        },
        {
          route: '/commissions',
          label: 'Commissions',
          icon: 'heroCurrencyDollar',
          visible: () =>
            this.perms.has('ManageCommissions') && this.entitlements.commissionsVisible(),
        },
        {
          route: '/communications',
          label: 'Communications',
          icon: 'heroChatBubbleLeftRight',
          visible: () => this.perms.has('ManageCommunications'),
        },
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

  protected dateTime(value?: string | null): string {
    if (!value) return 'the enforcement date';
    return new Date(value).toLocaleDateString('en-KE', {
      dateStyle: 'medium',
      timeZone: 'Africa/Nairobi',
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.company.set(await this.supabase.currentCompany());
    } catch {
      // brand falls back to 'Dukarun'
    }
    void this.profile.myProfile().catch(() => null);
    void this.companies
      .load()
      .catch(error => console.warn('Company switcher could not load', error));
    await Promise.all([this.locations.load(), this.entitlements.refresh().catch(() => undefined)]);
    await this.cashierSession.start();
    await this.orderQueueCounts.refresh();
  }

  /** Switch active company. CompanyContextService ends this in a full reload. */
  protected switchCompany(companyId: string): void {
    if (companyId === this.company()?.id) return;
    void this.companies.switchCompany(companyId).catch(() => undefined);
  }

  protected changeLocation(event: Event): void {
    const locationId = (event.target as HTMLSelectElement).value;
    if (!locationId || locationId === this.locations.activeId()) return;
    this.locations.select(locationId);
    void this.cashierSession.start().catch(() => undefined);
    void this.orderQueueCounts.refresh();
  }

  protected closeDrawer(): void {
    const toggle = document.getElementById('app-drawer') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }

  protected requestSignOut(): void {
    if (this.sync.syncing()) return;
    if (this.pendingSyncCount() > 0) {
      this.signOutWarning.set(true);
      return;
    }
    void this.signOut();
  }

  protected async signOut(): Promise<void> {
    this.signOutWarning.set(false);
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
