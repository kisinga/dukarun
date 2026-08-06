import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-animated-counter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ display() }}`,
})
export class AnimatedCounterComponent {
  target = input(0);
  duration = input(600);
  formatFn = input<(v: number) => string>((v) => v.toLocaleString());

  private readonly destroyRef = inject(DestroyRef);
  private rafId = 0;
  private current = signal(0);

  display = signal('0');

  constructor() {
    effect(() => {
      const end = this.target();
      const ms = this.duration();
      const fmt = this.formatFn();
      cancelAnimationFrame(this.rafId);
      const start = this.current();
      const startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / ms, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const value = start + (end - start) * eased;
        this.display.set(fmt(Math.round(value)));
        if (t < 1) {
          this.rafId = requestAnimationFrame(tick);
        } else {
          this.current.set(end);
        }
      };

      this.rafId = requestAnimationFrame(tick);
    });

    this.destroyRef.onDestroy(() => cancelAnimationFrame(this.rafId));
  }
}
