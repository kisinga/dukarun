import { Component, effect, inject, isDevMode, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    @if (showNavigationProgress()) {
      <div class="navigation-progress" role="progressbar" aria-label="Loading page"></div>
    }
    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
      .navigation-progress {
        position: fixed;
        inset: 0 auto auto 0;
        z-index: 1000;
        width: 38%;
        height: 2px;
        background: var(--color-primary);
        box-shadow: 0 0 6px color-mix(in oklab, var(--color-primary) 45%, transparent);
        animation: navigation-progress 900ms ease-in-out infinite;
        transform-origin: left;
        pointer-events: none;
      }
      @keyframes navigation-progress {
        0% {
          transform: translateX(-100%) scaleX(0.45);
        }
        55% {
          transform: translateX(115%) scaleX(1);
        }
        100% {
          transform: translateX(280%) scaleX(0.55);
        }
      }
    `,
  ],
})
export class App {
  private readonly updates = inject(SwUpdate);
  private readonly router = inject(Router);
  protected readonly showNavigationProgress = signal(false);
  private progressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.clearProgress();
        this.progressTimer = setTimeout(() => this.showNavigationProgress.set(true), 120);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        this.clearProgress();
      }
    });

    if (isDevMode() || !this.updates.isEnabled) return;

    const versionEvent = toSignal(this.updates.versionUpdates, { initialValue: null });
    const unrecoverable = toSignal(this.updates.unrecoverable, { initialValue: null });
    effect(() => {
      const event = versionEvent();
      if (event?.type === 'VERSION_READY') window.location.reload();
    });
    effect(() => {
      if (unrecoverable()) window.location.reload();
    });
  }

  private clearProgress(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.showNavigationProgress.set(false);
  }
}
