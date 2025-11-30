import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NotificationService } from '../../../../core/services/notification.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-notification-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body">
          <h2 class="card-title text-xl">Push Notifications</h2>
          <p class="text-sm opacity-70">
            Manage your notification preferences and subscription status
          </p>

          <div class="divider"></div>

          <!-- Push Notification Status -->
          <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center"
                [class.bg-success]="isPushEnabled()"
                [class.bg-warning]="permission() === 'default'"
                [class.bg-error]="!isPushEnabled() && permission() !== 'default'"
              >
                <span class="text-xl">{{ getStatusIcon() }}</span>
              </div>
              <div>
                <h3 class="font-semibold">Push Notifications</h3>
                <p class="text-sm opacity-70">
                  {{ getStatusMessage() }}
                </p>
                @if (permission() === 'denied') {
                  <p class="text-xs text-error mt-1">
                    Notifications are blocked. Please enable them in your browser settings.
                  </p>
                } @else if (permission() === 'default') {
                  <p class="text-xs text-warning mt-1">
                    Click "Enable" to request notification permission.
                  </p>
                }
              </div>
            </div>
            <button
              class="btn"
              [class.btn-success]="isPushEnabled()"
              [class.btn-warning]="permission() === 'default'"
              [class.btn-outline]="!isPushEnabled() && permission() !== 'default'"
              [disabled]="isLoading() || permission() === 'denied'"
              (click)="togglePushNotifications()"
            >
              @if (isLoading()) {
                <span class="loading loading-spinner loading-sm"></span>
              } @else {
                {{ getButtonText() }}
              }
            </button>
          </div>

          <!-- Notification Types -->
          <div class="space-y-4">
            <h3 class="font-semibold text-lg">Notification Types</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              @for (type of notificationTypes; track type.key) {
                <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">{{ type.icon }}</span>
                    <div>
                      <h4 class="font-medium">{{ type.label }}</h4>
                      <p class="text-sm opacity-70">{{ type.description }}</p>
                    </div>
                  </div>
                  <div class="badge badge-outline">{{ type.enabled ? 'Enabled' : 'Disabled' }}</div>
                </div>
              }
            </div>
            <p class="text-sm opacity-60 italic">
              All notification types are currently enabled by default. Per-type filtering will be
              available in a future update.
            </p>
          </div>
        </div>
      </div>

      <!-- Notification History -->
      <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <h2 class="card-title text-xl">Notification History</h2>
            <div class="flex gap-2">
              <select
                class="select select-sm select-bordered"
                [value]="selectedType()"
                (change)="onTypeFilterChange($event)"
              >
                <option value="">All Types</option>
                @for (type of notificationTypes; track type.key) {
                  <option [value]="type.key">{{ type.label }}</option>
                }
              </select>
              <button class="btn btn-sm btn-outline" (click)="markAllAsRead()">
                Mark All Read
              </button>
            </div>
          </div>

          <div class="space-y-2 max-h-96 overflow-y-auto">
            @for (notification of filteredNotifications(); track notification.id) {
              <div
                class="flex items-start gap-3 p-3 rounded-lg border border-base-300 hover:bg-base-200 transition-colors"
                [class.bg-base-200]="!notification.read"
              >
                <div
                  class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  [class.bg-warning]="getNotificationTypeClass(notification.type) === 'warning'"
                  [class.bg-success]="getNotificationTypeClass(notification.type) === 'success'"
                  [class.bg-info]="getNotificationTypeClass(notification.type) === 'info'"
                >
                  <span class="text-lg">{{ getNotificationIcon(notification.type) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between">
                    <h4 class="font-medium text-sm" [class.font-semibold]="!notification.read">
                      {{ notification.title }}
                    </h4>
                    @if (!notification.read) {
                      <div class="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1"></div>
                    }
                  </div>
                  <p class="text-sm opacity-70 mt-1">{{ notification.message }}</p>
                  <p class="text-xs opacity-50 mt-1">
                    {{ formatNotificationTime(notification.createdAt) }}
                  </p>
                </div>
                <button
                  class="btn btn-ghost btn-xs"
                  (click)="markAsRead(notification.id)"
                  [disabled]="notification.read"
                >
                  {{ notification.read ? 'Read' : 'Mark Read' }}
                </button>
              </div>
            } @empty {
              <div class="text-center py-8">
                <div class="text-4xl mb-2">📭</div>
                <p class="font-medium">No notifications found</p>
                <p class="text-sm opacity-60">Notifications will appear here when they arrive</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NotificationSettingsComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);

  // State
  private readonly selectedTypeSignal = signal<string>('');
  private readonly isLoadingSignal = signal<boolean>(false);

  // Computed values
  readonly isPushEnabled = this.notificationService.isPushEnabled;
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly selectedType = this.selectedTypeSignal.asReadonly();
  readonly notifications = this.notificationService.notifications;
  readonly permission = this.notificationService.permission;

  readonly notificationTypes = [
    {
      key: 'ORDER',
      label: 'Orders',
      icon: '💰',
      description: 'Order status updates and payments',
      enabled: true,
    },
    {
      key: 'STOCK',
      label: 'Stock Alerts',
      icon: '⚠️',
      description: 'Low stock and inventory warnings',
      enabled: true,
    },
    {
      key: 'ML_TRAINING',
      label: 'ML Training',
      icon: '🤖',
      description: 'Machine learning model updates',
      enabled: true,
    },
    {
      key: 'PAYMENT',
      label: 'Payments',
      icon: '💳',
      description: 'Payment confirmations and issues',
      enabled: true,
    },
  ];

  readonly filteredNotifications = computed(() => {
    const notifications = this.notifications();
    const selectedType = this.selectedType();

    if (!selectedType) {
      return notifications;
    }

    return notifications.filter((notification) => notification.type === selectedType);
  });

  async togglePushNotifications(): Promise<void> {
    this.isLoadingSignal.set(true);

    try {
      if (this.isPushEnabled()) {
        await this.notificationService.unsubscribeToPush();
      } else {
        // If permission is denied, we can't programmatically enable it.
        // But if it's default or granted, we can try.
        // requestPushPermission handles both permission request (if needed) and subscription.
        if (this.permission() === 'default') {
          await this.notificationService.requestPushPermission();
        } else {
          await this.notificationService.subscribeToPush();
        }
      }
    } catch (error) {
      console.error('Failed to toggle push notifications:', error);
      this.toastService.show('Error', 'Failed to update notification settings', 'error');
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  onTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedTypeSignal.set(target.value);
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationService.markAsRead(notificationId);
  }

  async markAllAsRead(): Promise<void> {
    await this.notificationService.markAllAsRead();
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

  getStatusIcon(): string {
    if (this.isPushEnabled()) return '🔔';
    if (this.permission() === 'default') return '❓';
    if (this.permission() === 'denied') return '🚫';
    return '🔕';
  }

  getStatusMessage(): string {
    if (this.isPushEnabled()) {
      return 'Enabled - You will receive real-time notifications';
    }
    if (this.permission() === 'default') {
      return 'Not configured - Click "Enable" to request permission';
    }
    if (this.permission() === 'denied') {
      return 'Blocked - Notifications are disabled in browser settings';
    }
    return 'Disabled - You will not receive push notifications';
  }

  getButtonText(): string {
    if (this.isPushEnabled()) return 'Disable';
    if (this.permission() === 'denied') return 'Blocked';
    return 'Enable';
  }
}
