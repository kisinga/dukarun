import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ServerClock, type ServerClockSnapshot } from './server-clock';

/** Canonical server clock. Existing authenticated responses calibrate it; no clock polling RPC. */
@Injectable({ providedIn: 'root' })
export class ServerClockService {
  private readonly clock = new ServerClock();
  private readonly tick = signal(0);

  constructor() {
    const timer = setInterval(() => this.tick.update(n => n + 1), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  now(): number | null {
    this.tick();
    return this.clock.now();
  }
  observe(serverTime: string | undefined): void {
    this.clock.observe(serverTime);
    this.tick.update(n => n + 1);
  }
  restore(snapshot: ServerClockSnapshot | null | undefined): void {
    this.clock.restore(snapshot);
    this.tick.update(n => n + 1);
  }
  snapshot(): ServerClockSnapshot | null {
    return this.clock.snapshot();
  }
}
