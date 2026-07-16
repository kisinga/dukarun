import { AfterViewInit, Component, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BRAND_CONFIG } from './shared/constants/brand.constants';
import { ToastComponent } from './shell/layout/toast/toast.component';
import { NetworkService } from './shell/services/network.service';
import { ToastService } from './shared/services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  template: `
    <router-outlet />

    <!-- Toast Container -->
    <app-toast [toasts]="toastService.toasts()" />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      /* Apply grayscale filter when offline */
      html.offline-mode {
        filter: grayscale(100%);
        transition: filter 0.3s ease-in-out;
      }

      /* Apply to all elements within offline mode */
      html.offline-mode * {
        filter: grayscale(100%);
      }
    `,
  ],
})
export class App implements AfterViewInit {
  protected readonly title = signal(`${BRAND_CONFIG.servicePrefix}-frontend`);
  protected readonly toastService = inject(ToastService);
  private readonly networkService = inject(NetworkService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    // Apply grayscale filter when offline (browser only — no DOM during SSR/prerender)
    effect(() => {
      if (!this.isBrowser) return;
      const isOffline = !this.networkService.isOnline();
      const htmlElement = document.documentElement;

      if (isOffline) {
        htmlElement.classList.add('offline-mode');
      } else {
        htmlElement.classList.remove('offline-mode');
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    // Remove loading spinner once Angular has rendered
    const loadingElement = document.getElementById('app-loading');
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }
  }
}
