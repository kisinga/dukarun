import { Injectable, effect, inject, Injector } from '@angular/core';
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
 * Notification Polling Service
 *
 * Auth-aware polling service that:
 * - Only polls when user is authenticated AND has valid channel token
 * - Stops polling on logout or auth errors
 * - Handles CHANNEL_NOT_FOUND by clearing stale token
 * - Uses exponential backoff on repeated failures
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationPollingService {
  private readonly apolloService = inject(ApolloService);
  private readonly injector = inject(Injector);
  private readonly stateService = inject(NotificationStateService);

  /**
   * Lazy getter for AuthService to break circular dependency
   * AuthService -> AuthLoginService -> AppInitService -> NotificationService -> NotificationPollingService -> AuthService
   */
  private get authService(): AuthService {
    return this.injector.get(AuthService);
  }

  private pollingInterval?: number;
  private consecutiveFailures = 0;
  private readonly POLL_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_BACKOFF_MS = 300000; // 5 minutes
  private readonly INITIAL_BACKOFF_MS = 60000; // 1 minute

  constructor() {
    // Watch auth state and channel availability - auto-start/stop polling
    effect(() => {
      const isAuthenticated = this.authService.isAuthenticated();
      const channelToken = this.apolloService.getChannelToken();
      const hasChannel = !!channelToken;

      if (isAuthenticated && hasChannel) {
        this.startPolling();
      } else {
        this.stopPolling();
        // Clear notification state when logged out or channel unavailable
        if (!isAuthenticated) {
          this.stateService.clear();
        }
      }
    });
  }

  /**
   * Start polling for notifications
   */
  private startPolling(): void {
    // Clear existing interval if any
    this.stopPolling();

    // Load initial data immediately
    this.loadAll();

    // Start polling interval
    this.pollingInterval = window.setInterval(() => {
      this.loadAll();
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Stop polling for notifications
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    this.consecutiveFailures = 0;
  }

  /**
   * Load notifications and unread count
   */
  async loadAll(): Promise<void> {
    // Check auth state before making requests
    if (!this.authService.isAuthenticated() || !this.apolloService.getChannelToken()) {
      this.stopPolling();
      return;
    }

    let hasErrors = false;
    let firstError: any = null;

    // Load both independently - if one fails, the other can still succeed
    const notificationsPromise = this.loadNotifications().catch((error) => {
      hasErrors = true;
      if (!firstError) firstError = error;
      return null;
    });

    const unreadCountPromise = this.loadUnreadCount().catch((error) => {
      hasErrors = true;
      if (!firstError) firstError = error;
      return null;
    });

    await Promise.all([notificationsPromise, unreadCountPromise]);

    // If there were errors, handle them
    if (hasErrors && firstError) {
      this.handlePollingError(firstError);
    } else {
      // Reset failure count on success
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Load notifications list
   */
  async loadNotifications(
    options: { skip?: number; take?: number; type?: NotificationType } = {},
  ): Promise<void> {
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
            type: item.type,
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
      // Don't throw - let handlePollingError deal with it
      throw error;
    } finally {
      this.stateService.setLoading(false);
    }
  }

  /**
   * Load unread count
   */
  async loadUnreadCount(): Promise<void> {
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
      // Don't throw - let handlePollingError deal with it
      throw error;
    }
  }

  /**
   * Handle polling errors with exponential backoff
   */
  private handlePollingError(error: any): void {
    this.consecutiveFailures++;

    // Check for CHANNEL_NOT_FOUND error
    const errorCode = error?.graphQLErrors?.[0]?.extensions?.code;
    const errorMessage = error?.message || '';
    const isChannelNotFound =
      errorCode === 'CHANNEL_NOT_FOUND' ||
      errorMessage.includes('CHANNEL_NOT_FOUND') ||
      errorMessage.includes('channel-not-found');

    if (isChannelNotFound) {
      // Clear stale channel token and stop polling
      this.apolloService.clearChannelToken();
      this.stopPolling();
      console.warn('Channel not found - cleared stale token and stopped polling');
      return;
    }

    // Handle other errors with exponential backoff
    if (this.consecutiveFailures > 3) {
      // After 3 failures, apply exponential backoff
      const backoffMs = Math.min(
        this.INITIAL_BACKOFF_MS * Math.pow(2, this.consecutiveFailures - 3),
        this.MAX_BACKOFF_MS,
      );

      console.warn(
        `Polling failed ${this.consecutiveFailures} times - backing off for ${backoffMs}ms`,
      );

      this.stopPolling();

      // Restart with backoff delay
      setTimeout(() => {
        if (this.authService.isAuthenticated() && this.apolloService.getChannelToken()) {
          this.startPolling();
        }
      }, backoffMs);
    }
  }

  /**
   * Manual refresh (can be called from UI)
   */
  async refresh(): Promise<void> {
    await this.loadAll();
  }
}
