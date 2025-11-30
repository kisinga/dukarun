import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { CompanyService } from '../../../../core/services/company.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-notification-test',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body">
          <h2 class="card-title text-xl">Notification System Status</h2>
          <p class="text-sm opacity-70">
            Monitor notification system health and trigger test notifications from server
          </p>

          <div class="divider"></div>

          <!-- System Status -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="stat bg-base-200 rounded-lg">
              <div class="stat-title">Total Notifications</div>
              <div class="stat-value text-primary">{{ totalNotifications() }}</div>
              <div class="stat-desc">{{ unreadNotifications() }} unread</div>
            </div>
            <div class="stat bg-base-200 rounded-lg">
              <div class="stat-title">Push Status</div>
              <div class="stat-value text-2xl">{{ isPushEnabled() ? '🔔' : '🔕' }}</div>
              <div class="stat-desc">{{ isPushEnabled() ? 'Enabled' : 'Disabled' }}</div>
            </div>
            <div class="stat bg-base-200 rounded-lg">
              <div class="stat-title">Service Worker</div>
              <div class="stat-value text-2xl">{{ swStatus() ? '✅' : '❌' }}</div>
              <div class="stat-desc">{{ swStatus() ? 'Active' : 'Inactive' }}</div>
            </div>
          </div>

          <!-- Server Test Controls -->
          <div class="space-y-4">
            <h3 class="font-semibold text-lg">Server Test Controls</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              @for (test of testScenarios; track test.type) {
                <div class="card bg-base-200 shadow-sm">
                  <div class="card-body p-4">
                    <div class="flex items-center gap-3 mb-3">
                      <span class="text-2xl">{{ test.icon }}</span>
                      <h3 class="font-semibold">{{ test.label }}</h3>
                    </div>
                    <p class="text-xs opacity-70 mb-3">{{ test.description }}</p>
                    <button
                      class="btn btn-sm w-full"
                      [class.btn-primary]="test.type === 'ORDER'"
                      [class.btn-warning]="test.type === 'STOCK'"
                      [class.btn-info]="test.type === 'ML_TRAINING'"
                      [class.btn-success]="test.type === 'PAYMENT'"
                      [disabled]="isLoading()"
                      (click)="triggerServerNotification(test.type)"
                    >
                      @if (isLoading()) {
                        <span class="loading loading-spinner loading-sm"></span>
                      } @else {
                        Test {{ test.label }}
                      }
                    </button>
                  </div>
                </div>
              }
            </div>

            <!-- Bulk Actions -->
            <div class="flex flex-wrap gap-2">
              <button
                class="btn btn-outline btn-sm"
                [disabled]="isLoading()"
                (click)="triggerAllServerNotifications()"
              >
                @if (isLoading()) {
                  <span class="loading loading-spinner loading-sm"></span>
                } @else {
                  🚀 Trigger All Types
                }
              </button>
              <button class="btn btn-outline btn-sm" (click)="testPushSubscription()">
                📱 Test Push
              </button>
              <button class="btn btn-outline btn-sm" (click)="refreshNotifications()">
                🔄 Refresh
              </button>
            </div>
          </div>

          <!-- Activity Log -->
          <div class="space-y-2">
            <h3 class="font-semibold">Recent Activity</h3>
            <div class="max-h-60 overflow-y-auto space-y-1">
              @for (log of activityLog(); track log.id) {
                <div
                  class="flex items-center gap-3 p-2 bg-base-200 rounded text-sm"
                  [class.bg-success]="log.type === 'success'"
                  [class.bg-warning]="log.type === 'warning'"
                  [class.bg-error]="log.type === 'error'"
                >
                  <span class="text-lg">{{ log.icon }}</span>
                  <div class="flex-1">
                    <span class="font-medium">{{ log.message }}</span>
                    <span class="opacity-60 ml-2">{{ log.timestamp }}</span>
                  </div>
                </div>
              } @empty {
                <div class="text-center py-4 text-sm opacity-60">
                  No activity yet. Trigger some notifications to see the flow!
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NotificationTestComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);

  // State
  private readonly activityLogSignal = signal<
    Array<{
      id: string;
      type: 'success' | 'warning' | 'error' | 'info';
      message: string;
      icon: string;
      timestamp: string;
    }>
  >([]);
  private readonly isLoadingSignal = signal<boolean>(false);

  // Computed values
  readonly notifications = this.notificationService.notifications;
  readonly unreadCount = this.notificationService.unreadCount;
  readonly isPushEnabled = this.notificationService.isPushEnabled;
  readonly isLoading = this.isLoadingSignal.asReadonly();

  readonly totalNotifications = computed(() => this.notifications().length);
  readonly unreadNotifications = computed(() => this.unreadCount());

  private readonly currentUserId = computed(() => this.authService.user()?.user?.id ?? null);
  private readonly currentChannelId = computed(
    () => this.companyService.activeChannel()?.id ?? null,
  );

  readonly swStatus = computed(() => {
    return 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
  });

  readonly activityLog = this.activityLogSignal.asReadonly();

  readonly testScenarios = [
    {
      type: 'ORDER',
      label: 'Order',
      icon: '💰',
      description: 'Test order notifications from server',
    },
    {
      type: 'STOCK',
      label: 'Stock',
      icon: '⚠️',
      description: 'Test low stock alerts from server',
    },
    {
      type: 'ML_TRAINING',
      label: 'ML Training',
      icon: '🤖',
      description: 'Test ML model updates from server',
    },
    {
      type: 'PAYMENT',
      label: 'Payment',
      icon: '💳',
      description: 'Test payment notifications from server',
    },
  ];

  async triggerServerNotification(type: string): Promise<void> {
    this.isLoadingSignal.set(true);

    try {
      const params: Record<string, string> = { type };
      const userId = this.currentUserId();
      const channelId = this.currentChannelId();

      if (userId) {
        params['userId'] = userId;
      }

      if (channelId) {
        params['channelId'] = channelId;
      }

      await this.http
        .get(`/test-notifications/trigger`, {
          params,
        })
        .toPromise();

      this.addActivityLog('success', '✅', `Server ${type} notification triggered`);
      this.toastService.show(
        'Server Notification',
        `Test ${type} notification sent from server`,
        'success',
        3000,
      );

      // Refresh notifications to get the new one from server
      this.refreshNotifications();
    } catch (error) {
      this.addActivityLog('error', '❌', `Failed to trigger server ${type} notification`);
      this.toastService.show(
        'Error',
        `Failed to trigger server notification: ${error}`,
        'error',
        5000,
      );
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  async triggerAllServerNotifications(): Promise<void> {
    this.isLoadingSignal.set(true);

    try {
      const payload: Record<string, string> = {};
      const userId = this.currentUserId();
      const channelId = this.currentChannelId();

      if (userId) {
        payload['userId'] = userId;
      }

      if (channelId) {
        payload['channelId'] = channelId;
      }

      await this.http.post(`/test-notifications/trigger-all`, payload).toPromise();

      this.addActivityLog('success', '🚀', 'All server notifications triggered');
      this.toastService.show(
        'Server Notifications',
        'All test notifications sent from server',
        'success',
        3000,
      );

      // Refresh notifications
      this.refreshNotifications();
    } catch (error) {
      this.addActivityLog('error', '❌', 'Failed to trigger all server notifications');
      this.toastService.show(
        'Error',
        `Failed to trigger all notifications: ${error}`,
        'error',
        5000,
      );
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  refreshNotifications(): void {
    this.notificationService.loadNotifications();
    this.notificationService.loadUnreadCount();
    this.addActivityLog('info', '🔄', 'Refreshed notifications');
  }

  async testPushSubscription(): Promise<void> {
    try {
      if (this.isPushEnabled()) {
        await this.notificationService.unsubscribeToPush();
        this.addActivityLog('info', '📱', 'Unsubscribed from push notifications');
      } else {
        await this.notificationService.subscribeToPush();
        this.addActivityLog('success', '📱', 'Subscribed to push notifications');
      }
    } catch (error) {
      this.addActivityLog('error', '❌', 'Failed to toggle push subscription');
    }
  }

  private addActivityLog(
    type: 'success' | 'warning' | 'error' | 'info',
    icon: string,
    message: string,
  ): void {
    const log = {
      id: this.generateId(),
      type,
      icon,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };

    this.activityLogSignal.update((logs) => [log, ...logs].slice(0, 20)); // Keep last 20 logs
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
