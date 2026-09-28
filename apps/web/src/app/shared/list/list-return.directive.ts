import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';
import {
  NavigationCancel,
  NavigationError,
  NavigationStart,
  Router,
  Scroll,
} from '@angular/router';
import { ListStateService } from './list-state';

/** Restores after Angular renders records, without changing router reuse or scroll ownership. */
@Directive({ selector: '[appListReturn]' })
export class ListReturnDirective implements OnDestroy {
  readonly enabled = input(false, { alias: 'appListReturn' });
  private readonly router = inject(Router);
  private readonly state = inject(ListStateService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private navigationPending = false;
  private pageTarget?: HTMLElement;
  private readonly cancelOnInteraction = () => {
    this.pageTarget = undefined;
    this.stopRestore();
  };
  private readonly subscription = this.router.events.subscribe(event => {
    if (event instanceof NavigationStart) {
      this.navigationPending = true;
      this.stopRestore();
      if (this.enabled()) this.state.capture(this.router.url, this.element.nativeElement);
    }
    if (event instanceof NavigationCancel || event instanceof NavigationError) {
      this.navigationPending = false;
      this.pageTarget = undefined;
    }
    // Angular's default scroll runs after NavigationEnd. Coordinate both numbered
    // pages and detail returns after it, so the router cannot overwrite our position.
    if (event instanceof Scroll) {
      this.navigationPending = false;
      this.frame = requestAnimationFrame(() => {
        if (!this.enabled()) return;
        if (this.scrollPageTarget()) return;
        const restore = () => {
          cancelAnimationFrame(this.frame);
          this.frame = requestAnimationFrame(() => {
            if (this.state.restore(this.router.url, this.element.nativeElement)) this.stopRestore();
          });
        };
        this.observer = new MutationObserver(restore);
        this.observer.observe(this.element.nativeElement, { childList: true, subtree: true });
        // An intentional user movement takes precedence over a pending restoration.
        window.addEventListener('wheel', this.cancelOnInteraction, { passive: true, once: true });
        window.addEventListener('pointerdown', this.cancelOnInteraction, {
          passive: true,
          once: true,
        });
        window.addEventListener('keydown', this.cancelOnInteraction, { once: true });
        restore();
        // Keep observing slow requests; this is cleanup, never a delay before restoration.
        this.timer = setTimeout(() => this.stopRestore(), 60000);
      });
    }
  });

  /** Numbered pagination takes precedence over an older return anchor for that URL. */
  scrollToRecords(target: HTMLElement): void {
    if (!this.enabled()) return;
    this.stopRestore();
    this.pageTarget = target;
    this.frame = requestAnimationFrame(() => {
      // Lists with local-only pagination have no router Scroll event to wait for.
      if (!this.navigationPending && !this.router.getCurrentNavigation()) this.scrollPageTarget();
    });
  }

  private scrollPageTarget(): boolean {
    const target = this.pageTarget;
    this.pageTarget = undefined;
    if (!target?.isConnected || !this.element.nativeElement.contains(target)) return false;
    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 64),
      behavior: 'instant',
    });
    return true;
  }

  private stopRestore(): void {
    this.observer?.disconnect();
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    window.removeEventListener('wheel', this.cancelOnInteraction);
    window.removeEventListener('pointerdown', this.cancelOnInteraction);
    window.removeEventListener('keydown', this.cancelOnInteraction);
  }
  ngOnDestroy(): void {
    this.stopRestore();
    this.subscription.unsubscribe();
  }
}
