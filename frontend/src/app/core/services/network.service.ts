import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { BackgroundStateService } from './background-state.service';
import { ToastService } from './toast.service';

/**
 * Network status service that monitors online/offline state
 * and integrates with PWA service worker functionality.
 */
@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  private readonly toastService = inject(ToastService);
  private readonly backgroundStateService = inject(BackgroundStateService);
  private readonly onlineStatusSignal = signal<boolean>(navigator.onLine);
  private readonly wasOfflineSignal = signal<boolean>(false);
  private previousStatus = navigator.onLine;
  private statusBeforeBackground: boolean | null = null;

  /**
   * Current online status
   */
  readonly isOnline = this.onlineStatusSignal.asReadonly();

  /**
   * Whether the app was offline at some point
   */
  readonly wasOffline = this.wasOfflineSignal.asReadonly();

  /**
   * Whether the app is currently offline
   */
  readonly isOffline = computed(() => !this.onlineStatusSignal());

  constructor() {
    this.setupEventListeners();

    // Show toast notifications when status changes
    effect(() => {
      const currentStatus = this.onlineStatusSignal();
      const isReturningFromBackground = this.backgroundStateService.isReturningFromBackground();
      const isBackground = this.backgroundStateService.isBackground();

      // Track status when going to background
      if (isBackground && this.statusBeforeBackground === null) {
        this.statusBeforeBackground = currentStatus;
        return;
      }

      // When returning from background, check if status changed while we were away
      if (isReturningFromBackground) {
        // If status changed while backgrounded, we'll show notification after suppression window
        // Don't update previousStatus yet - wait until suppression window closes
        return;
      }

      // After suppression window closes, check if status changed while backgrounded
      if (!isBackground && this.statusBeforeBackground !== null) {
        const statusChangedWhileAway = currentStatus !== this.statusBeforeBackground;
        // Reset tracking
        this.statusBeforeBackground = null;

        // If status changed while away, show notification now
        if (statusChangedWhileAway) {
          if (!currentStatus) {
            // Went offline while backgrounded
            this.wasOfflineSignal.set(true);
            this.showOfflineNotification();
          } else {
            // Came online while backgrounded
            if (this.wasOfflineSignal()) {
              this.wasOfflineSignal.set(false);
              this.showOnlineNotification();
            }
          }
          this.previousStatus = currentStatus;
          return;
        }
      }

      // Normal foreground operation - show notification when status changes
      if (currentStatus !== this.previousStatus) {
        if (!currentStatus) {
          // Just went offline
          this.wasOfflineSignal.set(true);
          this.showOfflineNotification();
        } else {
          // Just came online
          if (this.wasOfflineSignal()) {
            this.wasOfflineSignal.set(false);
            this.showOnlineNotification();
          }
        }
        this.previousStatus = currentStatus;
      }
    });
  }

  /**
   * Check if currently online
   */
  checkOnlineStatus(): boolean {
    const online = navigator.onLine;
    this.updateStatus(online);
    return online;
  }

  /**
   * Setup event listeners for online/offline events
   */
  private setupEventListeners(): void {
    // Handle online event
    window.addEventListener('online', () => {
      this.updateStatus(true);
    });

    // Handle offline event
    window.addEventListener('offline', () => {
      this.updateStatus(false);
    });

    // Check service worker status if available
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.checkOnlineStatus();
      });
    }
  }

  /**
   * Update the online status
   */
  private updateStatus(isOnline: boolean): void {
    this.onlineStatusSignal.set(isOnline);
  }

  /**
   * Show toast notification when going offline
   */
  private showOfflineNotification(): void {
    this.toastService.show(
      'Offline Mode',
      'You are now offline. Some features may be limited.',
      'warning',
      7000,
    );
  }

  /**
   * Show toast notification when coming back online
   */
  private showOnlineNotification(): void {
    this.toastService.show(
      'Back Online',
      'Connection restored. All features are now available.',
      'success',
      5000,
    );
  }
}
