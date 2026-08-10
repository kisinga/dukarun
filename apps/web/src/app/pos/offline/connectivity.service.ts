import { Injectable, computed, signal } from '@angular/core';

export type ConnectivityState = 'online' | 'offline';

/**
 * Single seam for the online/offline decision: navigator.onLine + browser
 * online/offline events, plus a manual override for testing. Everything
 * else (Sell screen, sync engine) reads `online()` and never touches
 * navigator directly.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly browserOnline = signal(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  private readonly manualOverride = signal<boolean | null>(null);
  /** Bumped when a suspended/mobile tab becomes active again. */
  readonly resumeTick = signal(0);

  readonly online = computed(() => this.manualOverride() ?? this.browserOnline());
  /** Canonical application-level connection state for UI and data services. */
  readonly state = computed<ConnectivityState>(() => (this.online() ? 'online' : 'offline'));
  readonly offline = computed(() => this.state() === 'offline');

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.browserOnline.set(true));
      window.addEventListener('offline', () => this.browserOnline.set(false));
      window.addEventListener('focus', () => this.resumeTick.update(value => value + 1));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.resumeTick.update(value => value + 1);
        }
      });
    }
  }

  /** Test seam: force online (true) / offline (false), or null to follow the browser. */
  setOverride(value: boolean | null): void {
    this.manualOverride.set(value);
  }
}
