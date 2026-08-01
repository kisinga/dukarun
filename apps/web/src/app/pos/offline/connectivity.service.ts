import { Injectable, computed, signal } from '@angular/core';

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

  readonly online = computed(() => this.manualOverride() ?? this.browserOnline());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.browserOnline.set(true));
      window.addEventListener('offline', () => this.browserOnline.set(false));
    }
  }

  /** Test seam: force online (true) / offline (false), or null to follow the browser. */
  setOverride(value: boolean | null): void {
    this.manualOverride.set(value);
  }
}
