/** Persistable calibration; never changes a sale's captured timestamp or expiry. */
export interface ServerClockSnapshot {
  serverTime: number;
  observedAt: number;
}

/** One estimate of server time. Browser time measures elapsed time, never authority. */
export class ServerClock {
  private anchor: ServerClockSnapshot | null = null;
  private monotonicAt = 0;

  constructor(
    private readonly wall = () => Date.now(),
    private readonly monotonic = () => performance.now()
  ) {}

  observe(iso: string | undefined): void {
    const time = Date.parse(iso ?? '');
    if (!Number.isFinite(time)) return;
    // A slower request must not rewind a more recent calibration.
    const current = this.now();
    this.anchor = { serverTime: Math.max(time, current ?? time), observedAt: this.wall() };
    this.monotonicAt = this.monotonic();
  }

  restore(snapshot: ServerClockSnapshot | null | undefined): void {
    if (this.now() !== null || !snapshot) return;
    const elapsed = this.wall() - snapshot.observedAt;
    // Reload cannot trust a backwards clock or a calibration older than a day.
    if (
      !Number.isFinite(snapshot.serverTime) ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed >= 86_400_000
    )
      return;
    this.anchor = { serverTime: snapshot.serverTime + elapsed, observedAt: this.wall() };
    this.monotonicAt = this.monotonic();
  }

  now(): number | null {
    if (!this.anchor) return null;
    const wallElapsed = this.wall() - this.anchor.observedAt;
    const elapsed = this.monotonic() - this.monotonicAt;
    // Clock changes and platforms whose monotonic clock stops during sleep need
    // a fresh server response. Fail closed rather than granting extra time.
    if (elapsed < 0 || wallElapsed < 0 || Math.abs(wallElapsed - elapsed) > 5000) return null;
    return this.anchor.serverTime + elapsed;
  }

  snapshot(): ServerClockSnapshot | null {
    const now = this.now();
    return now === null ? null : { serverTime: now, observedAt: this.wall() };
  }
}
