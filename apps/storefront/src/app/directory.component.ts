import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StorefrontInfo, StorefrontService } from './storefront.service';
import { StorefrontBrandComponent } from './storefront-brand.component';
import { StorefrontSeoService } from './storefront-seo.service';

/** `/` is the directory of public storefronts. */
@Component({
  selector: 'app-directory',
  imports: [RouterLink, StorefrontBrandComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-md py-8">
        <h1 class="text-2xl font-bold tracking-tight">Dukarun shops</h1>
        <p class="mt-1 text-sm text-base-content/60">
          Browse a shop's catalog and order on WhatsApp.
        </p>

        @if (error()) {
          <p class="mt-4 text-sm text-error">{{ error() }}</p>
        }

        @if (!loading() && shops().length === 0) {
          <div class="card mt-6 bg-base-100 shadow-sm">
            <div class="card-body p-6 text-center">
              <p class="font-semibold">No shops are public yet</p>
              <p class="mt-1 text-sm text-base-content/60">
                When a shop opens its storefront, it appears here.
              </p>
            </div>
          </div>
        } @else {
          <div class="mt-6 flex flex-col gap-2">
            @for (shop of shops(); track shop.id) {
              <a
                [routerLink]="['/', shop.slug]"
                class="card bg-base-100 shadow-sm transition-shadow hover:shadow-md"
              >
                <div class="card-body flex-row items-center gap-3 p-4">
                  <app-storefront-brand
                    [name]="shop.name"
                    [logoUrl]="companyLogoUrl(shop.logo_path)"
                    [compact]="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{{ shop.name }}</p>
                    @if (!shop.catalogue_visible) {
                      <p class="text-xs text-base-content/60">Catalogue unavailable</p>
                    }
                  </div>
                  <span class="text-base-content/40">→</span>
                </div>
              </a>
            }
          </div>
        }
        <p class="mt-8 text-center text-xs text-base-content/50">
          <a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a>
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </p>
      </div>
    </main>
  `,
})
export class DirectoryComponent implements OnInit {
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly initialShops = this.storefront.transferredDirectory();

  protected readonly shops = signal<StorefrontInfo[]>(this.initialShops ?? []);
  protected readonly loading = signal(this.initialShops === null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.seo.set('Dukarun shops', 'Browse public Dukarun shops and order on WhatsApp.', '/');
    try {
      this.shops.set(
        await this.storefront.directory(
          isPlatformBrowser(this.platformId) && this.initialShops !== null
        )
      );
    } catch (err) {
      if (this.initialShops === null) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load shops');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected companyLogoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }

  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
}
