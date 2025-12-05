import { Injectable, inject } from '@angular/core';
import {
  MarkAllAsReadDocument,
  MarkNotificationAsReadDocument,
  NotificationType,
} from '../graphql/generated/graphql';
import { ApolloService } from './apollo.service';
import { NotificationLoaderService } from './notification/notification-loader.service';
import { NotificationPushService } from './notification/notification-push.service';
import { NotificationStateService } from './notification/notification-state.service';
import { ToastService } from './toast.service';

/**
 * Notification Service (Facade)
 *
 * Composable facade that delegates to specialized services:
 * - NotificationStateService: State management
 * - NotificationLoaderService: On-demand loading (no polling)
 * - NotificationPushService: Push subscription handling
 *
 * Maintains backward compatibility with existing public API.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(NotificationStateService);
  private readonly loaderService = inject(NotificationLoaderService);
  private readonly pushService = inject(NotificationPushService);
  private readonly toastService = inject(ToastService);

  // Delegate state signals from state service
  readonly notifications = this.stateService.notifications;
  readonly unreadCount = this.stateService.unreadCount;
  readonly isLoading = this.stateService.isLoading;

  // Delegate push signals from push service
  readonly isPushEnabled = this.pushService.isPushEnabled;
  readonly permission = this.pushService.permission;

  /**
   * Load notifications list
   */
  async loadNotifications(
    options: { skip?: number; take?: number; type?: NotificationType } = {},
  ): Promise<void> {
    return this.loaderService.loadNotifications(options);
  }

  /**
   * Load unread count
   */
  async loadUnreadCount(): Promise<void> {
    return this.loaderService.loadUnreadCount();
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: MarkNotificationAsReadDocument,
        variables: { id: notificationId },
      });

      if (result.data?.markNotificationAsRead) {
        // Update local state
        this.stateService.markAsRead(notificationId);
        // Refresh unread count
        await this.loadUnreadCount();
        this.toastService.show('Notification', 'Marked as read', 'success', 3000);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      this.toastService.show('Error', 'Failed to mark as read', 'error', 3000);
      return false;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<number> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: MarkAllAsReadDocument,
      });

      const markedCount = result.data?.markAllAsRead || 0;

      if (markedCount > 0) {
        // Update local state
        this.stateService.markAllAsRead();
        this.toastService.show(
          'Notifications',
          `Marked ${markedCount} notifications as read`,
          'success',
          3000,
        );
      } else {
        this.toastService.show('Notifications', 'No unread notifications', 'info', 3000);
      }

      return markedCount;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      this.toastService.show('Error', 'Failed to mark all as read', 'error', 3000);
      return 0;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(): Promise<boolean> {
    return this.pushService.subscribeToPush();
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeToPush(): Promise<boolean> {
    return this.pushService.unsubscribeToPush();
  }

  /**
   * Request push notification permission
   */
  async requestPushPermission(): Promise<boolean> {
    return this.pushService.requestPushPermission();
  }

  /**
   * Prompt for notification permission if not already prompted
   */
  async promptPermissionIfNeeded(): Promise<void> {
    return this.pushService.promptPermissionIfNeeded();
  }

  /**
   * Refresh notifications (manual trigger)
   */
  async refresh(): Promise<void> {
    return this.loaderService.loadAll();
  }
}
