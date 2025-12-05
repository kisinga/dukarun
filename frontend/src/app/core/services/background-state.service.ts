import { Injectable, computed, signal } from '@angular/core';

/**
 * Background State Service
 *
 * Centralized service to track app visibility state using Page Visibility API.
 * Provides signals for background/foreground state and detects when app returns from background.
 *
 * Use this service to pause/resume operations when app goes to background.
 */
@Injectable({
  providedIn: 'root',
})
export class BackgroundStateService {
  private readonly isBackgroundSignal = signal<boolean>(document.hidden);
  private readonly isReturningFromBackgroundSignal = signal<boolean>(false);
  private lastBackgroundTime: number | null = null;
  private returnFromBackgroundTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Whether the app is currently in the background
   */
  readonly isBackground = this.isBackgroundSignal.asReadonly();

  /**
   * Whether the app is currently in the foreground
   * Computed from isBackground to ensure automatic synchronization
   */
  readonly isForeground = computed(() => !this.isBackgroundSignal());

  /**
   * Whether the app just returned from background (true for first 2 seconds after return)
   * Use this to suppress notifications that might have queued while in background
   */
  readonly isReturningFromBackground = this.isReturningFromBackgroundSignal.asReadonly();

  constructor() {
    this.setupVisibilityListener();
  }

  /**
   * Setup Page Visibility API listener
   */
  private setupVisibilityListener(): void {
    // Initial state
    this.updateVisibilityState();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      this.updateVisibilityState();
    });
  }

  /**
   * Update visibility state based on document.hidden
   */
  private updateVisibilityState(): void {
    const isHidden = document.hidden;
    const wasBackground = this.isBackgroundSignal();

    this.isBackgroundSignal.set(isHidden);

    // Detect transition from background to foreground
    if (wasBackground && !isHidden) {
      this.handleReturnFromBackground();
    } else if (!wasBackground && isHidden) {
      this.handleGoToBackground();
    }
  }

  /**
   * Handle app going to background
   */
  private handleGoToBackground(): void {
    this.lastBackgroundTime = Date.now();
    this.isReturningFromBackgroundSignal.set(false);

    // Clear any existing timeout
    if (this.returnFromBackgroundTimeout) {
      clearTimeout(this.returnFromBackgroundTimeout);
      this.returnFromBackgroundTimeout = null;
    }
  }

  /**
   * Handle app returning from background
   */
  private handleReturnFromBackground(): void {
    // Set flag immediately
    this.isReturningFromBackgroundSignal.set(true);

    // Clear any existing timeout
    if (this.returnFromBackgroundTimeout) {
      clearTimeout(this.returnFromBackgroundTimeout);
    }

    // Clear flag after 2 seconds
    this.returnFromBackgroundTimeout = setTimeout(() => {
      this.isReturningFromBackgroundSignal.set(false);
      this.returnFromBackgroundTimeout = null;
    }, 2000);
  }

  /**
   * Get the duration the app was in background (in milliseconds)
   * Returns null if app is currently in background or was never in background
   */
  getBackgroundDuration(): number | null {
    if (this.isBackgroundSignal()) {
      return null; // Currently in background
    }

    if (this.lastBackgroundTime === null) {
      return null; // Never was in background
    }

    return Date.now() - this.lastBackgroundTime;
  }
}
