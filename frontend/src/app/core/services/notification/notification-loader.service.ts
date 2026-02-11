import { Injectable, Injector, inject } from '@angular/core';
import {
  GetUnreadCountDocument,
  GetUserNotificationsDocument,
  NotificationType,
} from '../../graphql/generated/graphql';
import type { Notification } from '../../graphql/notification.types';
import { ApolloService } from '../apollo.service';
import { AuthService } from '../auth.service';
import { NotificationStateService } from './notification-state.service';

/**
 * Notification Loader Service
 *
 * Simple service for loading notifications on-demand.
 * Used for:
 * - Initial load when app starts
 * - Refresh when push notification arrives
 * - Manual refresh from UI
 *
 * No automatic polling - relies on push notifications for real-time updates.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationLoaderService {
  private readonly apolloService = inject(ApolloService);
  private readonly injector = inject(Injector);
  private readonly stateService = inject(NotificationStateService);

  /**
   * Lazy getter for AuthService to break circular dependency
   */
  private get authService(): AuthService {
    return this.injector.get(AuthService);
  }

  /**
   * Load notifications list
   */
  async loadNotifications(
    options: { skip?: number; take?: number; type?: NotificationType } = {},
  ): Promise<void> {
    // Check auth state before making request
    if (!this.authService.isAuthenticated() || !this.apolloService.getChannelToken()) {
      return;
    }

    this.stateService.setLoading(true);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GetUserNotificationsDocument,
        variables: { options },
        fetchPolicy: 'network-only',
      });

      if (result?.data?.getUserNotifications?.items) {
        const notifications: Notification[] = result.data.getUserNotifications.items.map(
          (item) => ({
            id: item.id,
            userId: item.userId,
            channelId: item.channelId,
            type: item.type as Notification['type'],
            title: item.title,
            message: item.message,
            data: item.data,
            read: item.read,
            createdAt: item.createdAt,
          }),
        );
        this.stateService.setNotifications(notifications);
      }
    } catch (error: any) {
      console.error('Failed to load notifications:', error);
      // Don't throw - let caller handle errors if needed
    } finally {
      this.stateService.setLoading(false);
    }
  }

  /**
   * Load unread count
   */
  async loadUnreadCount(): Promise<void> {
    // Check auth state before making request
    if (!this.authService.isAuthenticated() || !this.apolloService.getChannelToken()) {
      return;
    }

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GetUnreadCountDocument,
        fetchPolicy: 'network-only',
      });

      if (typeof result?.data?.getUnreadCount === 'number') {
        this.stateService.setUnreadCount(result.data.getUnreadCount);
      }
    } catch (error: any) {
      console.error('Failed to load unread count:', error);
      // Don't throw - let caller handle errors if needed
    }
  }

  /**
   * Load both notifications and unread count
   */
  async loadAll(): Promise<void> {
    await Promise.all([this.loadNotifications(), this.loadUnreadCount()]);
  }
}
