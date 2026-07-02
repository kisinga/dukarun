import { ChangeDetectionStrategy, Component, effect, inject, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { PoweredByComponent } from './core/components/powered-by.component';
import { StoreAvatarComponent } from './core/components/store-avatar.component';
import { StoreDirectoryComponent } from './core/components/store-directory.component';
import { SeoService } from './core/services/seo.service';
import { StorefrontStateService } from './core/services/storefront-state.service';
import { buildWhatsAppLink } from './core/utils/whatsapp.util';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, StoreDirectoryComponent, PoweredByComponent, StoreAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state.status();
    @let store = state.store();

    @if (s === 'loading') {
      <div class="flex min-h-screen items-center justify-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
    } @else if (s === 'directory') {
      <app-store-directory />
    } @else if (s === 'not-found') {
      <div class="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 class="text-2xl font-bold">Store not found</h1>
        <p class="max-w-sm text-base-content/70">
          This address doesn't match an active store. Please check the link and try again.
        </p>
      </div>
    } @else if (store) {
      <div class="flex min-h-screen flex-col">
        <header class="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur">
          <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
            <a routerLink="/" class="flex min-w-0 items-center gap-2.5">
              <app-store-avatar
                [name]="store.name"
                [logoUrl]="store.logoUrl"
                boxClass="h-9 w-9 rounded-box shrink-0"
              />
              <span class="truncate text-lg font-bold">{{ store.name }}</span>
            </a>
          </div>
        </header>

        <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
          @if (s === 'lapsed') {
            <div class="flex flex-col items-center gap-3 py-16 text-center">
              <h1 class="text-xl font-bold">{{ store.name }}</h1>
              <p class="max-w-sm text-base-content/70">
                This store is currently unavailable. Please check back soon.
              </p>
            </div>
          } @else {
            <router-outlet />
          }
        </main>

        <footer class="mt-8 border-t border-base-300 bg-base-100">
          <div class="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between">
            <div class="flex flex-col items-center gap-1.5 text-sm text-base-content/70 sm:items-start">
              @if (store.whatsappNumber && s !== 'lapsed') {
                <a
                  [href]="whatsappLink(store.whatsappNumber)"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-2 font-medium text-base-content hover:text-primary"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.393l-.999 3.648 3.9-1.34z" />
                  </svg>
                  Order on WhatsApp
                </a>
              }
              <span>&copy; {{ year }} {{ store.name }}</span>
            </div>
            <app-powered-by />
          </div>
        </footer>
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  readonly state = inject(StorefrontStateService);
  private readonly seo = inject(SeoService);
  readonly year = new Date().getFullYear();

  constructor() {
    // Store-level SEO for terminal states; catalogue pages set their own.
    effect(() => {
      const s = this.state.status();
      const store = this.state.store();
      // Make the browser tab feel owned by the merchant.
      if (store?.logoUrl) this.seo.setFavicon(store.logoUrl);
      if (s === 'not-found') {
        this.seo.setPage({ title: 'Store not found', noindex: true });
      } else if (s === 'lapsed' && store) {
        this.seo.setPage({
          title: store.name,
          description: 'This store is currently unavailable.',
          image: store.logoUrl,
          noindex: true,
        });
      }
    });
  }

  ngOnInit(): void {
    void this.state.resolve();
  }

  whatsappLink(number: string): string {
    return buildWhatsAppLink(number, 'Hello! I have a question about your products.');
  }
}
