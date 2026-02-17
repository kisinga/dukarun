import { Injectable, effect, inject, Injector, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../../environments/environment';
import {
  SubscribeToPushDocument,
  UnsubscribeToPushDocument,
} from '../../graphql/generated/graphql';
import { AppCacheService } from '../cache/app-cache.service';
import { ApolloService } from '../apollo.service';
import { AuthService } from '../auth.service';
import { NotificationLoaderService } from './notification-loader.service';
import { ToastService } from '../toast.service';

/**
 * Notification Push Service
 *
 * Handles push notification subscriptions, permissions, and service worker integration.
 * Only attempts subscription when authenticated.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationPushService {
  private readonly apolloService = inject(ApolloService);
  private readonly injector = inject(Injector);
  private readonly swPush = inject(SwPush);
  private readonly toastService = inject(ToastService);
  private readonly loaderService = inject(NotificationLoaderService);

  /**
   * Lazy getter for AuthService to break circular dependency
   * AuthService -> AuthLoginService -> AppInitService -> NotificationService -> NotificationPushService -> AuthService
   */
  private get authService(): AuthService {
    return this.injector.get(AuthService);
  }

  // State signals
  private readonly isPushEnabledSignal = signal<boolean>(false);
  private readonly permissionSignal = signal<NotificationPermission>('default');

  // Public readonly signals
  readonly isPushEnabled = this.isPushEnabledSignal.asReadonly();
  readonly permission = this.permissionSignal.asReadonly();

  private static readonly CACHE_KEY_PROMPTED = 'notification_permission_prompted';

  private readonly appCache = inject(AppCacheService);

  constructor() {
    // Initialize push service when authenticated
    effect(() => {
      const isAuthenticated = this.authService.isAuthenticated();
      if (isAuthenticated) {
        this.initialize();
      } else {
        // Clear push state on logout
        this.isPushEnabledSignal.set(false);
      }
    });

    // Setup push message handlers if service worker is available
    if (this.swPush.isEnabled) {
      this.setupPushHandlers();
    }
  }

  /**
   * Initialize push notifications (check permission, ensure subscription)
   */
  private async initialize(): Promise<void> {
    try {
      await this.checkPermissionStatus();

      // Check if push notifications are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
      }

      if (this.swPush.isEnabled) {
        await this.ensureSubscription();
      }
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }

  /**
   * Setup push message and click handlers
   */
  private setupPushHandlers(): void {
    if (!this.swPush.isEnabled) {
      return;
    }

    this.swPush.messages.subscribe((message) => {
      this.handlePushMessage(message);
    });

    this.swPush.notificationClicks.subscribe((event) => {
      this.handleNotificationClick(event);
    });
  }

  /**
   * Handle incoming push message
   */
  private handlePushMessage(message: any): void {
    console.log('Received push message:', message);

    // Refresh notifications and unread count when push arrives
    this.loaderService.loadAll();

    // Show toast for foreground notification if payload has title/body
    if (message?.notification?.title) {
      this.toastService.show(
        message.notification.title,
        message.notification.body || '',
        'info',
        5000,
      );
    }
  }

  /**
   * Handle notification click
   */
  private handleNotificationClick(event: any): void {
    console.log('Notification clicked:', event);

    // Focus the app window
    window.focus();

    // Navigate if URL present
    if (event.notification.data?.url) {
      // TODO: Use router if available
      // window.location.href = event.notification.data.url;
    }
  }

  /**
   * Check and update permission status
   */
  private async checkPermissionStatus(): Promise<void> {
    if (!('Notification' in window)) {
      this.permissionSignal.set('denied');
      return;
    }

    const permission = Notification.permission;
    this.permissionSignal.set(permission);

    if (permission === 'granted' && this.swPush.isEnabled) {
      await this.ensureSubscription();
    } else {
      this.isPushEnabledSignal.set(false);
    }
  }

  /**
   * Ensure we have an active subscription
   */
  private async ensureSubscription(): Promise<void> {
    try {
      const sub = await this.swPush.subscription.toPromise();
      if (sub) {
        this.isPushEnabledSignal.set(true);
      } else if (Notification.permission === 'granted') {
        // Permission granted but no subscription - try to subscribe
        await this.subscribeToPush();
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      this.isPushEnabledSignal.set(false);
    }
  }

  /**
   * Prompt for notification permission if not already prompted
   */
  async promptPermissionIfNeeded(): Promise<void> {
    if (await this.hasPrompted()) {
      return;
    }

    await this.setPrompted();

    if (Notification.permission === 'default') {
      await this.requestPushPermission();
    }
  }

  /**
   * Request push notification permission
   */
  async requestPushPermission(): Promise<boolean> {
    try {
      const permission = await Notification.requestPermission();
      this.permissionSignal.set(permission);

      if (permission !== 'granted') {
        this.isPushEnabledSignal.set(false);
        return false;
      }

      // Only set enabled if service worker is available
      if (!this.swPush.isEnabled) {
        this.isPushEnabledSignal.set(false);
        if (this.isDevMode()) {
          this.toastService.show(
            'Push Notifications',
            'Service worker not available in development mode. Notifications will use polling fallback.',
            'info',
            5000,
          );
        }
        return false;
      }

      // Attempt subscription
      return await this.subscribeToPush();
    } catch (error) {
      console.error('Failed to request push permission:', error);
      this.isPushEnabledSignal.set(false);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(): Promise<boolean> {
    try {
      // Check permission
      const permission = await this.getNotificationPermission();
      this.permissionSignal.set(permission);

      if (permission === 'denied') {
        this.isPushEnabledSignal.set(false);
        this.toastService.show(
          'Push Notifications',
          'Notifications are blocked. Please enable them in your browser settings.',
          'error',
          5000,
        );
        return false;
      }

      if (permission !== 'granted') {
        this.isPushEnabledSignal.set(false);
        this.toastService.show(
          'Push Notifications',
          'Notification permission is required. Please grant permission to enable push notifications.',
          'warning',
          5000,
        );
        return false;
      }

      // Check authentication
      if (!this.authService.isAuthenticated()) {
        this.isPushEnabledSignal.set(false);
        console.warn('Cannot subscribe to push - user not authenticated');
        return false;
      }

      if (!this.swPush.isEnabled) {
        this.isPushEnabledSignal.set(false);
        if (this.isDevMode()) {
          this.toastService.show(
            'Push Notifications',
            'Service worker not available in development mode. Notifications will use polling fallback.',
            'info',
            5000,
          );
        }
        return false;
      }

      // Request subscription from service worker
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });

      console.log('Push subscription obtained from service worker:', subscription);

      // Convert subscription to JSON format
      let subscriptionJSON: any;
      try {
        subscriptionJSON = subscription.toJSON();
      } catch (e) {
        // Fallback: manually extract if toJSON() fails
        const p256dhKey = subscription.getKey('p256dh');
        const authKey = subscription.getKey('auth');

        if (!p256dhKey || !authKey) {
          throw new Error('Failed to extract subscription keys');
        }

        subscriptionJSON = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: this.arrayBufferToBase64(p256dhKey),
            auth: this.arrayBufferToBase64(authKey),
          },
        };
      }

      if (!subscriptionJSON.endpoint) {
        throw new Error('Invalid subscription: endpoint is missing');
      }

      if (!subscriptionJSON.keys || !subscriptionJSON.keys.p256dh || !subscriptionJSON.keys.auth) {
        throw new Error('Invalid subscription: keys are missing or incomplete');
      }

      // Send subscription to backend
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: SubscribeToPushDocument,
        variables: {
          subscription: {
            endpoint: subscriptionJSON.endpoint,
            keys: subscriptionJSON.keys,
          },
        },
      });

      // Check for errors in the result first (Apollo may return errors even with data)
      const resultWithErrors = result as any;
      if (
        resultWithErrors.errors &&
        Array.isArray(resultWithErrors.errors) &&
        resultWithErrors.errors.length > 0
      ) {
        const firstError = resultWithErrors.errors[0];
        const errorMessage = firstError.message || 'Unknown GraphQL error';
        const errorCode = firstError.extensions?.code;
        console.error('GraphQL errors in subscription result:', resultWithErrors.errors);
        throw new Error(`GraphQL error: ${errorCode ? `[${errorCode}] ` : ''}${errorMessage}`);
      }

      // Check if the mutation returned true (explicitly check for boolean true)
      const subscriptionResult = result.data?.subscribeToPush;

      // Log the result for debugging
      console.log('Subscription mutation result:', {
        hasData: !!result.data,
        subscribeToPush: subscriptionResult,
        type: typeof subscriptionResult,
      });

      if (subscriptionResult === true) {
        // Success - subscription created
        console.log('✅ Push subscription created and synced to backend');
        this.isPushEnabledSignal.set(true);
        this.toastService.show(
          'Push Notifications',
          'Successfully subscribed to push notifications',
          'success',
          5000,
        );
        return true;
      } else if (subscriptionResult === false) {
        // Backend explicitly returned false - subscription failed
        console.warn('❌ Backend rejected subscription (returned false)');
        throw new Error('Backend rejected subscription. Please try again.');
      } else if (!result.data) {
        // No data at all - likely a network or server error
        console.warn('⚠️ No data in mutation result');
        throw new Error('No response from server. Please check your connection and try again.');
      } else {
        // Data exists but subscribeToPush is not true/false - unexpected
        console.error('❌ Unexpected subscription result structure:', {
          data: result.data,
          subscribeToPush: subscriptionResult,
        });
        throw new Error('Unexpected response from server. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to subscribe to push notifications:', error);
      console.error('Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        graphQLErrors: error?.graphQLErrors,
        networkError: error?.networkError,
      });
      this.isPushEnabledSignal.set(false);

      // Provide helpful error messages
      if (error.message?.includes('user dismissed') || error.message?.includes('dismissed')) {
        this.toastService.show(
          'Push Notifications',
          'Permission request was dismissed. You can enable notifications later in settings.',
          'info',
          5000,
        );
        return false;
      }

      if (error.message?.includes('GraphQL error') || error.message?.includes('Backend rejected')) {
        this.toastService.show(
          'Push Notifications',
          'Failed to sync subscription with server. Please try again later.',
          'error',
          5000,
        );
        return false;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.toastService.show(
        'Push Notifications',
        `Failed to enable push notifications: ${errorMessage}`,
        'error',
        5000,
      );

      return false;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeToPush(): Promise<boolean> {
    try {
      // Unsubscribe from service worker
      if (this.swPush.isEnabled) {
        await this.swPush.unsubscribe();
      }

      // Notify backend
      const client = this.apolloService.getClient();
      await client.mutate({
        mutation: UnsubscribeToPushDocument,
      });

      this.isPushEnabledSignal.set(false);

      this.toastService.show(
        'Push Notifications',
        'Successfully unsubscribed from push notifications',
        'info',
        3000,
      );

      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  /**
   * Get notification permission
   */
  private async getNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Check if dev mode
   */
  private isDevMode(): boolean {
    return !environment.production;
  }

  /**
   * Check if permission was already prompted (stored in app cache, cleared on logout)
   */
  private async hasPrompted(): Promise<boolean> {
    const value = await this.appCache.getKV<boolean>(
      'global',
      NotificationPushService.CACHE_KEY_PROMPTED,
    );
    return value === true;
  }

  /**
   * Mark permission as prompted
   */
  private async setPrompted(): Promise<void> {
    await this.appCache.setKV('global', NotificationPushService.CACHE_KEY_PROMPTED, true);
  }

  /**
   * Convert ArrayBuffer to base64 (fallback if toJSON() doesn't work)
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
