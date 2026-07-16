import { Injectable, signal } from '@angular/core';
import type { Notification } from '../../../shared/graphql/notification.types';

/**
 * Notification State Service
 *
 * Pure state management for notifications - no side effects, no API calls.
 * Owns all notification-related signals and provides methods to update them.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationStateService {
  // Private state signals
  private readonly notificationsSignal = signal<Notification[]>([]);
  private readonly unreadCountSignal = signal<number>(0);
  private readonly isLoadingSignal = signal<boolean>(false);

  // Public readonly signals
  readonly notifications = this.notificationsSignal.asReadonly();
  readonly unreadCount = this.unreadCountSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();

  /**
   * Set notifications list
   */
  setNotifications(notifications: Notification[]): void {
    this.notificationsSignal.set(notifications);
  }

  /**
   * Update notifications list (merge/replace as needed)
   */
  updateNotifications(updater: (current: Notification[]) => Notification[]): void {
    this.notificationsSignal.update(updater);
  }

  /**
   * Set unread count
   */
  setUnreadCount(count: number): void {
    this.unreadCountSignal.set(count);
  }

  /**
   * Mark a notification as read in local state
   */
  markAsRead(notificationId: string): void {
    this.notificationsSignal.update((notifications) => {
      const notification = notifications.find((n) => n.id === notificationId);
      const wasUnread = notification?.read === false;

      // Update notification
      const updated = notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      );

      // Decrement unread count if notification was unread
      if (wasUnread) {
        this.unreadCountSignal.update((count) => Math.max(0, count - 1));
      }

      return updated;
    });
  }

  /**
   * Mark all notifications as read in local state
   */
  markAllAsRead(): void {
    this.notificationsSignal.update((notifications) =>
      notifications.map((n) => ({ ...n, read: true })),
    );
    this.unreadCountSignal.set(0);
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoadingSignal.set(loading);
  }

  /**
   * Clear all notification state (useful for logout)
   */
  clear(): void {
    this.notificationsSignal.set([]);
    this.unreadCountSignal.set(0);
    this.isLoadingSignal.set(false);
  }
}
