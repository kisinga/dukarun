import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../../../core/services/auth.service';
import { CompanyService } from '../../../../../core/services/company.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { ToastService } from '../../../../../core/services/toast.service';

interface ActivityLog {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  icon: string;
  timestamp: string;
}

@Component({
  selector: 'app-notification-test',
  imports: [CommonModule],
  templateUrl: './notification-test.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationTestComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);

  private readonly activityLogSignal = signal<ActivityLog[]>([]);
  private readonly isLoadingSignal = signal<boolean>(false);

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
    { type: 'ORDER', label: 'Order', icon: '💰', description: 'Test order notifications' },
    { type: 'STOCK', label: 'Stock', icon: '📦', description: 'Test stock alerts' },
    { type: 'ML_TRAINING', label: 'ML', icon: '🤖', description: 'Test ML updates' },
    { type: 'PAYMENT', label: 'Payment', icon: '💳', description: 'Test payments' },
  ];

  async triggerServerNotification(type: string): Promise<void> {
    this.isLoadingSignal.set(true);

    try {
      const params: Record<string, string> = { type };
      const userId = this.currentUserId();
      const channelId = this.currentChannelId();

      if (userId) params['userId'] = userId;
      if (channelId) params['channelId'] = channelId;

      await this.http.get(`/test-notifications/trigger`, { params }).toPromise();

      this.addActivityLog('success', '✅', `${type} notification triggered`);
      this.toastService.show('Notification', `Test ${type} sent`, 'success', 3000);
      this.refreshNotifications();
    } catch (error) {
      this.addActivityLog('error', '❌', `Failed: ${type}`);
      this.toastService.show('Error', `Failed: ${error}`, 'error', 5000);
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

      if (userId) payload['userId'] = userId;
      if (channelId) payload['channelId'] = channelId;

      await this.http.post(`/test-notifications/trigger-all`, payload).toPromise();

      this.addActivityLog('success', '🚀', 'All notifications triggered');
      this.toastService.show('Notifications', 'All test notifications sent', 'success', 3000);
      this.refreshNotifications();
    } catch (error) {
      this.addActivityLog('error', '❌', 'Failed to trigger all');
      this.toastService.show('Error', `Failed: ${error}`, 'error', 5000);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  refreshNotifications(): void {
    this.notificationService.loadNotifications();
    this.notificationService.loadUnreadCount();
    this.addActivityLog('info', '🔄', 'Refreshed');
  }

  async testPushSubscription(): Promise<void> {
    try {
      if (this.isPushEnabled()) {
        await this.notificationService.unsubscribeToPush();
        this.addActivityLog('info', '📱', 'Push unsubscribed');
      } else {
        await this.notificationService.subscribeToPush();
        this.addActivityLog('success', '📱', 'Push subscribed');
      }
    } catch {
      this.addActivityLog('error', '❌', 'Push toggle failed');
    }
  }

  private addActivityLog(type: ActivityLog['type'], icon: string, message: string): void {
    const log: ActivityLog = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      icon,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.activityLogSignal.update((logs) => [log, ...logs].slice(0, 20));
  }
}
