import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../../../core/services/notification.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-notification-settings',
  imports: [CommonModule],
  templateUrl: './notification-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);

  private readonly selectedTypeSignal = signal<string>('');
  private readonly isLoadingSignal = signal<boolean>(false);

  readonly isPushEnabled = this.notificationService.isPushEnabled;
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly selectedType = this.selectedTypeSignal.asReadonly();
  readonly notifications = this.notificationService.notifications;
  readonly permission = this.notificationService.permission;

  readonly notificationTypes = [
    { key: 'ORDER', label: 'Orders', icon: '💰', description: 'Order updates', enabled: true },
    { key: 'STOCK', label: 'Stock', icon: '📦', description: 'Inventory alerts', enabled: true },
    { key: 'ML_TRAINING', label: 'ML', icon: '🤖', description: 'Model updates', enabled: true },
    { key: 'PAYMENT', label: 'Payments', icon: '💳', description: 'Payment status', enabled: true },
  ];

  readonly filteredNotifications = computed(() => {
    const notifications = this.notifications();
    const selectedType = this.selectedType();
    if (!selectedType) return notifications;
    return notifications.filter((n) => n.type === selectedType);
  });

  async togglePushNotifications(): Promise<void> {
    this.isLoadingSignal.set(true);
    try {
      if (this.isPushEnabled()) {
        await this.notificationService.unsubscribeToPush();
      } else if (this.permission() === 'default') {
        await this.notificationService.requestPushPermission();
      } else {
        await this.notificationService.subscribeToPush();
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
    const found = this.notificationTypes.find((t) => t.key === type);
    return found?.icon || 'ℹ️';
  }

  getNotificationTypeClass(type: string): string {
    switch (type) {
      case 'ORDER':
      case 'PAYMENT':
        return 'success';
      case 'STOCK':
        return 'warning';
      default:
        return 'info';
    }
  }

  formatNotificationTime(createdAt: string): string {
    const now = new Date();
    const time = new Date(createdAt);
    const diffMins = Math.floor((now.getTime() - time.getTime()) / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }

  getStatusMessage(): string {
    if (this.isPushEnabled()) return 'Notifications enabled';
    if (this.permission() === 'default') return 'Not configured';
    if (this.permission() === 'denied') return 'Blocked';
    return 'Disabled';
  }

  getButtonText(): string {
    if (this.isPushEnabled()) return 'Disable';
    if (this.permission() === 'denied') return 'Blocked';
    return 'Enable';
  }
}
