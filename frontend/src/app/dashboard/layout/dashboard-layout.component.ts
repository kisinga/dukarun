import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppInitService } from '../../core/services/app-init.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { NetworkService } from '../../core/services/network.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationStateService } from '../../core/services/notification/notification-state.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import {
  CashierSessionService,
  type PaymentMethodReconciliationConfig,
} from '../../core/services/cashier-session/cashier-session.service';
import { ShiftModalTriggerService } from '../../core/services/cashier-session/shift-modal-trigger.service';
import type { Notification } from '../../core/graphql/notification.types';
import {
  MenuToggleButtonComponent,
  NavIconComponent,
  NotificationDropdownComponent,
  UserAvatarButtonComponent,
} from '../components/shared';
import type { NavItem, NavSection } from './nav.types';

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MenuToggleButtonComponent,
    NavIconComponent,
    NotificationDropdownComponent,
    UserAvatarButtonComponent,
  ],
  templateUrl: './dashboard-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly appInitService = inject(AppInitService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationStateService = inject(NotificationStateService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly router = inject(Router);
  private readonly networkService = inject(NetworkService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly shiftModalTrigger = inject(ShiftModalTriggerService);
  private readonly destroyRef = inject(DestroyRef);
  private lastCompanyId: string | null = null;

  /** Open/close shift modal state (hosted in layout so it works from navbar badge). */
  protected readonly dayModalMode = signal<'open' | 'close' | null>(null);
  protected readonly dayModalConfig = signal<PaymentMethodReconciliationConfig[]>([]);
  protected readonly dayModalBalances = signal<Record<string, string>>({});
  protected readonly dayModalNotes = signal('');

  /** Standalone overview link (always first). */
  protected readonly overviewItem: NavItem = {
    label: 'Overview',
    icon: 'overview',
    route: '/dashboard',
  };

  protected readonly navSections = computed((): NavSection[] => {
    const auth = this.authService;
    const hasCredit = auth.hasCreditManagementPermission();
    const hasStockAdj = auth.hasManageStockAdjustmentsPermission();
    const hasSettings = auth.hasUpdateSettingsPermission();
    const trial = this.isTrialActive();

    const sections: NavSection[] = [
      {
        label: 'Operations',
        items: [
          { label: 'Sell', icon: 'sell', route: '/dashboard/sell' },
          { label: 'Products', icon: 'products', route: '/dashboard/products' },
          { label: 'Sales', icon: 'orders', route: '/dashboard/orders' },
          { label: 'Purchases', icon: 'purchases', route: '/dashboard/purchases' },
          {
            label: 'Stock Adjustments',
            icon: 'stock-adjustments',
            route: '/dashboard/stock-adjustments',
            visible: () => hasStockAdj,
          },
        ],
      },
      {
        label: 'Finance',
        items: [
          { label: 'Payments', icon: 'payments', route: '/dashboard/payments' },
          {
            label: 'Credit',
            icon: 'credit',
            route: '/dashboard/credit',
            visible: () => hasCredit,
          },
          {
            label: 'Accounting',
            icon: 'accounting',
            route: '/dashboard/accounting',
            visible: () => hasSettings,
          },
          // { label: 'Approvals', icon: 'approvals', route: '/dashboard/approvals' },
        ],
      },
      {
        label: 'People',
        items: [
          { label: 'Customers', icon: 'customers', route: '/dashboard/customers' },
          { label: 'Suppliers', icon: 'suppliers', route: '/dashboard/suppliers' },
        ],
      },
    ];

    if (hasSettings) {
      sections.push({
        items: [
          { label: 'Admin', icon: 'admin', route: '/dashboard/admin' },
          {
            label: 'Upgrade',
            icon: 'upgrade',
            route: '/dashboard/admin/subscription',
            visible: () => trial,
          },
        ],
      });
    }

    return sections;
  });

  // Use notification service
  protected readonly notifications = this.notificationService.notifications;

  // Auth service signals
  protected readonly user = this.authService.user;
  protected readonly fullName = this.authService.fullName;

  // Company service signals
  protected readonly companies = this.companyService.companies;
  protected readonly activeCompanyId = this.companyService.activeCompanyId;
  protected readonly activeCompany = this.companyService.activeCompany;
  protected readonly companyDisplayName = this.companyService.companyDisplayName;
  protected readonly companyLogoAsset = this.companyService.companyLogoAsset;
  protected readonly companyLogoUrl = this.companyService.companyLogoUrl;

  // Use notification service
  protected readonly unreadCount = this.notificationService.unreadCount;

  // Subscription status
  protected readonly isTrialActive = this.subscriptionService.isTrialActive;

  /** Whether to show Settings link in footer (requires UpdateSettings permission). */
  protected hasSettingsForFooter(): boolean {
    return this.authService.hasUpdateSettingsPermission();
  }

  // Network status
  protected readonly isOnline = this.networkService.isOnline;

  // Shift status
  protected readonly shiftOpen = this.cashierSessionService.hasActiveSession;

  protected readonly userAvatar = computed(() => {
    const user = this.user();
    // Check for profile picture in customFields first
    const profilePicture = (user as any)?.customFields?.profilePicture;
    if (profilePicture?.preview || profilePicture?.source) {
      return profilePicture.preview || profilePicture.source;
    }
    return 'default_avatar.png';
  });

  protected readonly logoUrl = computed(() => {
    // Use the new proxy-compatible logo URL directly
    return this.companyLogoUrl() || 'shop_icon.png';
  });

  constructor() {
    // Note: Company session is now restored in AuthService before channels are fetched
    // This ensures the selected company persists across page refreshes

    // Watch for active company changes and initialize dashboard
    // Uses reinitialize() on company switch to clear cache first
    effect(() => {
      const companyId = this.activeCompanyId();
      if (companyId && companyId !== this.lastCompanyId) {
        const isSwitch = this.lastCompanyId !== null;
        this.lastCompanyId = companyId;

        if (isSwitch) {
          // Company switch: clear cache and reinitialize
          this.appInitService.reinitialize(companyId);
        } else {
          // First load: just initialize
          this.appInitService.initializeDashboard(companyId);
        }
      }
    });

    // Open shift modal when triggered from navbar badge or overview
    this.shiftModalTrigger.open$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      if (mode === 'open') this.openOpenDayModal();
      else this.openCloseDayModal();
    });
  }

  async ngOnInit(): Promise<void> {
    // Initialization is handled by the effect in constructor
    // Notifications are loaded via AppInitService during dashboard initialization

    // Prompt for notification permission on dashboard navigation
    this.notificationService.promptPermissionIfNeeded();

    // Check subscription status and create trial notification if needed
    // Do this after notifications are loaded (via AppInitService) so we can check for existing ones
    await this.checkAndCreateTrialNotification();
  }

  closeDrawer(): void {
    const checkbox = document.getElementById('dashboard-drawer') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = false;
    }
  }

  selectCompany(companyId: string): void {
    this.companyService.activateCompany(companyId);
    // Effect in constructor handles cache clearing and reinitialization
  }

  async logout(): Promise<void> {
    // Clear cached data before logout
    this.appInitService.clearCache();
    await this.authService.logout();
  }

  // Notification handling methods
  async markNotificationAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications().find((n) => n.id === notificationId);

    // Check if this is a trial notification and navigate to payment area
    if (notification && this.isTrialNotification(notification)) {
      // Mark as read in local state (synthetic notification - no backend call needed)
      if (notificationId.startsWith('trial-')) {
        this.notificationStateService.markAsRead(notificationId);
        // Update unread count
        await this.notificationService.loadUnreadCount();
      } else {
        // Real notification from backend - mark via service
        await this.notificationService.markAsRead(notificationId);
      }

      await this.router.navigate(['/dashboard/admin/subscription']);
      return;
    }

    // Check if this is an approval notification and navigate accordingly
    if (notification?.data?.approvalId) {
      await this.notificationService.markAsRead(notificationId);
      const navigateTo = notification.data.navigateTo;
      if (navigateTo && typeof navigateTo === 'string') {
        // Parse route and query params from navigateTo (e.g., "/dashboard/purchases/create?approvalId=xxx")
        const [path, queryString] = navigateTo.split('?');
        const queryParams: Record<string, string> = {};
        if (queryString) {
          for (const pair of queryString.split('&')) {
            const [key, value] = pair.split('=');
            if (key && value) queryParams[key] = decodeURIComponent(value);
          }
        }
        await this.router.navigate([path], { queryParams });
      } else {
        await this.router.navigate(['/dashboard/approvals']);
      }
      return;
    }

    // Regular notification - mark as read normally
    await this.notificationService.markAsRead(notificationId);
  }

  /**
   * Check if notification is trial-related
   */
  private isTrialNotification(notification: any): boolean {
    const title = notification.title?.toLowerCase() || '';
    const message = notification.message?.toLowerCase() || '';
    return (
      title.includes('trial') ||
      title.includes('early tester') ||
      message.includes('trial') ||
      message.includes('early tester')
    );
  }

  /**
   * Check subscription status and inject trial notification if needed
   */
  private async checkAndCreateTrialNotification(): Promise<void> {
    try {
      const status = await this.subscriptionService.checkSubscriptionStatus();
      if (!status || status.status !== 'trial' || !status.isValid) {
        return; // Not in trial or trial expired
      }

      // Check if trial notification already exists
      const existingNotifications = this.notifications();
      const hasTrialNotification = existingNotifications.some((n) => this.isTrialNotification(n));

      if (hasTrialNotification) {
        return; // Already has trial notification
      }

      // Create trial notification and inject into notification state
      const trialNotification: Notification = {
        id: `trial-${Date.now()}`,
        userId: this.user()?.user?.id || '',
        channelId: this.activeCompanyId() || '',
        type: 'PAYMENT',
        title: status.isEarlyTester ? 'Early Tester Program' : 'Trial Period Active',
        message: status.isEarlyTester
          ? "You're part of our early testers program. Upgrade anytime to support the platform!"
          : status.daysRemaining
            ? `Your trial ends in ${status.daysRemaining} day${status.daysRemaining !== 1 ? 's' : ''}. Upgrade now to continue using all features.`
            : 'Your trial period is active. Upgrade now to continue using all features.',
        read: false,
        createdAt: new Date().toISOString(),
        data: {
          isTrialNotification: true,
          subscriptionStatus: status,
        },
      };

      // Inject into notification state (will reset on refresh - that's okay)
      this.notificationStateService.updateNotifications((notifications) => {
        // Add to beginning of list if not already present
        if (!notifications.some((n) => this.isTrialNotification(n))) {
          return [trialNotification, ...notifications];
        }
        return notifications;
      });

      // Update unread count
      this.notificationStateService.setUnreadCount(this.notificationStateService.unreadCount() + 1);
    } catch (error) {
      console.error('Failed to check subscription status for trial notification:', error);
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    await this.notificationService.markAllAsRead();
  }

  /** Open the shift modal in "open shift" mode. */
  openOpenDayModal(): void {
    const companyId = this.companyService.activeCompanyId();
    if (!companyId) return;
    const channelId = parseInt(companyId, 10);
    if (isNaN(channelId)) return;
    this.cashierSessionService.error.set(null);
    this.dayModalMode.set('open');
    this.dayModalBalances.set({});
    this.dayModalNotes.set('');
    this.cashierSessionService.getChannelReconciliationConfig(channelId).subscribe((config) => {
      const cashierControlled = config.filter((c) => c.isCashierControlled);
      this.dayModalConfig.set(cashierControlled);
      const balances: Record<string, string> = {};
      cashierControlled.forEach((c) => (balances[c.ledgerAccountCode] = ''));
      this.dayModalBalances.set(balances);
    });
  }

  /** Open the shift modal in "close shift" mode. */
  openCloseDayModal(): void {
    const session = this.cashierSessionService.currentSession();
    if (!session) return;
    this.cashierSessionService.error.set(null);
    const channelId =
      typeof session.channelId === 'number'
        ? session.channelId
        : parseInt(String(session.channelId), 10);
    this.dayModalMode.set('close');
    this.dayModalBalances.set({});
    this.dayModalNotes.set('');
    this.cashierSessionService.getChannelReconciliationConfig(channelId).subscribe((config) => {
      const cashierControlled = config.filter((c) => c.isCashierControlled);
      this.dayModalConfig.set(cashierControlled);
      const balances: Record<string, string> = {};
      cashierControlled.forEach((c) => (balances[c.ledgerAccountCode] = ''));
      this.dayModalBalances.set(balances);
    });
  }

  closeDayModal(): void {
    this.dayModalMode.set(null);
    this.dayModalConfig.set([]);
    this.dayModalBalances.set({});
    this.cashierSessionService.error.set(null);
  }

  setDayModalBalance(accountCode: string, value: string | number): void {
    const str = value != null && value !== '' ? String(value) : '';
    this.dayModalBalances.update((prev) => ({ ...prev, [accountCode]: str }));
  }

  async submitDayModal(): Promise<void> {
    const mode = this.dayModalMode();
    const config = this.dayModalConfig();
    const balances = this.dayModalBalances();
    if (!mode || config.length === 0) return;

    if (mode === 'open') {
      const companyId = this.companyService.activeCompanyId();
      if (!companyId) return;
      const channelId = parseInt(companyId, 10);
      if (isNaN(channelId)) return;
      const openingBalances: { accountCode: string; amountCents: number }[] = [];
      for (const c of config) {
        const raw = balances[c.ledgerAccountCode];
        const str = (raw != null ? String(raw) : '').trim();
        const amountCents = Math.round(parseFloat(str || '0') * 100);
        if (isNaN(amountCents) || amountCents < 0) return;
        openingBalances.push({ accountCode: c.ledgerAccountCode, amountCents });
      }
      this.cashierSessionService.openSession(channelId, openingBalances).subscribe((session) => {
        if (session) this.closeDayModal();
      });
      return;
    }

    const session = this.cashierSessionService.currentSession();
    if (!session) return;
    const id = typeof session.id === 'string' ? session.id.trim() : '';
    if (!id || id === '-1') return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return;
    const closingBalances: Array<{ accountCode: string; amountCents: number }> = [];
    for (const c of config) {
      const raw = balances[c.ledgerAccountCode];
      const str = (raw != null ? String(raw) : '').trim();
      const amountCents = Math.round(parseFloat(str || '0') * 100);
      if (isNaN(amountCents) || amountCents < 0) return;
      closingBalances.push({ accountCode: c.ledgerAccountCode, amountCents });
    }
    const channelId =
      typeof session.channelId === 'number'
        ? session.channelId
        : parseInt(String(session.channelId), 10);
    this.cashierSessionService
      .closeSession(
        id,
        closingBalances,
        this.dayModalNotes().trim() || undefined,
        Number.isNaN(channelId) ? undefined : channelId,
      )
      .subscribe((summary) => {
        if (summary) this.closeDayModal();
      });
  }

  /** Open shift modal from navbar: close when open, open when closed. */
  openShiftModalFromBadge(): void {
    if (this.shiftOpen()) {
      this.shiftModalTrigger.openCloseModal();
    } else {
      this.shiftModalTrigger.openOpenModal();
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'ORDER':
        return '💰';
      case 'STOCK':
        return '⚠️';
      case 'ML_TRAINING':
        return '🤖';
      case 'PAYMENT':
        return '💳';
      case 'APPROVAL':
        return '📋';
      default:
        return 'ℹ️';
    }
  }

  getNotificationTypeClass(type: string): string {
    switch (type) {
      case 'ORDER':
        return 'success';
      case 'STOCK':
        return 'warning';
      case 'ML_TRAINING':
        return 'info';
      case 'PAYMENT':
        return 'success';
      case 'APPROVAL':
        return 'warning';
      default:
        return 'info';
    }
  }

  formatNotificationTime(createdAt: string): string {
    const now = new Date();
    const notificationTime = new Date(createdAt);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minutes ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }
}
