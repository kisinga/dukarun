import { AfterViewInit, Component, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { BRAND_CONFIG } from './core/constants/brand.constants';
import { ToastComponent } from './core/layout/toast/toast.component';
import { NetworkService } from './core/services/network.service';
import { ToastService } from './core/services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
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
