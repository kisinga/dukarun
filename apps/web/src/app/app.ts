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
    @if (updateNotice()) {
      <div
        class="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-overlay"
        role="status"
      >
        <p class="flex-1 text-sm">
          {{ updateNotice() }} Finish your transaction, then close and reopen the app.
        </p>
        <button type="button" class="btn btn-ghost min-h-11" (click)="updateNotice.set(null)">
          Dismiss
        </button>
      </div>
    }
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
  protected readonly updateNotice = signal<string | null>(null);
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
      if (event?.type === 'VERSION_READY') this.updateNotice.set('An update is ready.');
    });
    effect(() => {
      if (unrecoverable()) this.updateNotice.set('The app needs to restart.');
    });
  }

  private clearProgress(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.showNavigationProgress.set(false);
  }
}
