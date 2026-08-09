import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CatalogRow,
  ShopCollection,
  StorefrontInfo,
  StorefrontService,
} from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';
import { environment } from '../environments/environment';

/** Format integer shillings as KES for display. */
function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** `/:slug` is a shop's public catalog with WhatsApp ordering. */
@Component({
  selector: 'app-shop',
  imports: [RouterLink],
  template: `
    <main class="min-h-screen bg-base-200 pb-24">
      @if (notFound()) {
        <div class="mx-auto max-w-md p-4 py-16 text-center">
          <p class="text-2xl font-bold tracking-tight">Shop not found</p>
          <p class="mt-2 text-sm text-base-content/60">
            This link doesn't match any public shop. Check the link and try again.
          </p>
          <a routerLink="/" class="btn btn-primary mt-6 min-h-11">Browse shops</a>
        </div>
      } @else if (shop(); as s) {
        <!-- Shop header -->
        <header class="border-b border-base-300 bg-base-100">
          <div class="mx-auto flex max-w-2xl items-center gap-3 p-4">
            @if (imageUrl(s.logo_path); as logo) {
              <img [src]="logo" alt="" class="h-12 w-12 rounded-xl object-cover" />
            }
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-xl font-bold tracking-tight">{{ s.name }}</h1>
              <p class="text-xs text-base-content/60">
                Order on WhatsApp. Pay on pickup or delivery.
              </p>
            </div>
            @if (s.public_whatsapp_number) {
              <a
                [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
                target="_blank"
                rel="noopener"
                class="btn btn-primary btn-sm min-h-11"
              >
                WhatsApp
              </a>
            }
          </div>
        </header>

        <div class="mx-auto max-w-2xl p-4">
          @if (!s.catalogue_visible) {
            <!-- Lapsed / hidden catalogue: identity only, NEVER products -->
            <div class="card mt-6 bg-base-100 shadow-sm">
              <div class="card-body p-6 text-center">
                <p class="font-semibold">This shop's catalog is taking a break</p>
                <p class="mt-1 text-sm text-base-content/60">
                  You can still reach them on WhatsApp to order.
                </p>
                @if (s.public_whatsapp_number) {
                  <a
                    [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
                    target="_blank"
                    rel="noopener"
                    class="btn btn-primary mt-4 min-h-11"
                  >
                    Message {{ s.name }}
                  </a>
                }
              </div>
            </div>
          } @else if (catalogLoading()) {
            <div class="card mt-6 bg-base-100 shadow-sm">
              <div class="card-body p-6 text-center">
                <span
                  class="loading loading-spinner loading-md mx-auto"
                  aria-label="Loading products"
                ></span>
                <p class="mt-2 text-sm text-base-content/60">Loading current products…</p>
              </div>
            </div>
          } @else if (catalogError()) {
            <div class="card mt-6 border border-error/30 bg-base-100">
              <div class="card-body p-6 text-center">
                <p class="font-semibold">Catalog unavailable</p>
                <p class="mt-1 text-sm text-base-content/60">
                  Products could not load. Check your connection and try again.
                </p>
              </div>
            </div>
          } @else if (catalog().length === 0) {
            <div class="card mt-6 bg-base-100 shadow-sm">
              <div class="card-body p-6 text-center">
                <p class="font-semibold">Nothing listed yet</p>
                <p class="mt-1 text-sm text-base-content/60">
                  This shop has not listed products yet. Check back soon.
                </p>
              </div>
            </div>
          } @else {
            <!-- Search -->
            <input
              type="text"
              class="input input-bordered mb-3 w-full"
              placeholder="Search products or manufacturers…"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />

            <!-- Product grid -->
            <div class="grid grid-cols-2 gap-3">
              @for (item of filtered(); track item.variant_id) {
                <div class="card overflow-hidden bg-base-100 shadow-sm">
                  @if (imageUrl(item.image_path); as img) {
                    <img [src]="img" alt="" class="h-28 w-full object-cover" loading="lazy" />
                  }
                  <div class="card-body gap-1 p-3">
                    <p class="text-sm leading-tight font-semibold">{{ label(item) }}</p>
                    @if (item.manufacturer_name) {
                      <span class="badge badge-ghost badge-xs w-fit">{{
                        item.manufacturer_name
                      }}</span>
                    }
                    @if (item.kind === 'service') {
                      <span class="badge badge-info badge-xs w-fit">Service</span>
                    }
                    <p class="text-sm font-bold tabular-nums">{{ fmt(item.price ?? 0) }}</p>
                    @if (shop()!.public_whatsapp_number) {
                      <a
                        [href]="
                          waLink(
                            shop()!.public_whatsapp_number!,
                            'Hello ' + shop()!.name + '! Do you have ' + label(item) + '?'
                          )
                        "
                        target="_blank"
                        rel="noopener"
                        class="btn btn-outline btn-primary btn-xs mt-1 min-h-11"
                      >
                        Ask on WhatsApp
                      </a>
                    }
                  </div>
                </div>
              }
            </div>
            @if (filtered().length === 0) {
              <p class="py-8 text-center text-sm text-base-content/60">
                No products match "{{ query() }}".
              </p>
            }
          }
        </div>

        <!-- Floating shop-level WhatsApp CTA -->
        @if (s.public_whatsapp_number && s.catalogue_visible) {
          <a
            [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
            target="_blank"
            rel="noopener"
            class="btn btn-primary fixed right-4 bottom-4 z-40 min-h-11 shadow-lg"
          >
            Order on WhatsApp
          </a>
        }
        <footer class="mx-auto max-w-2xl px-4 pt-8 text-center text-xs text-base-content/50">
          <a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a>
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </footer>
      } @else if (!error()) {
        <div class="mx-auto max-w-md p-4 py-16 text-center text-sm text-base-content/60">
          Loading…
        </div>
      }
      @if (error()) {
        <div class="mx-auto max-w-md p-4 py-16 text-center">
          <p class="text-sm text-error">{{ error() }}</p>
        </div>
      }
    </main>
  `,
})
export class ShopComponent implements OnInit {
  private readonly storefront = inject(StorefrontService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(StorefrontSeoService);
  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly initialShop = this.slug
    ? this.storefront.transferredStorefront(this.slug)
    : undefined;

  protected readonly shop = signal<StorefrontInfo | null>(this.initialShop ?? null);
  protected readonly catalog = signal<CatalogRow[]>([]);
  protected readonly collections = signal<ShopCollection[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly catalogError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim();
    if (!q) return this.catalog();
    const tokens = this.searchTokens(q);
    return this.catalog().filter(item => {
      const searchable = this.searchTokens(
        [item.product_name, item.variant_name, item.manufacturer_name, item.sku]
          .filter((value): value is string => !!value)
          .join(' ')
      ).join(' ');
      return tokens.every(token => searchable.includes(token));
    });
  });

  async ngOnInit(): Promise<void> {
    const slug = this.slug;
    if (!slug) {
      this.notFound.set(true);
      this.catalogLoading.set(false);
      return;
    }
    try {
      const shop = await this.storefront.storefront(
        slug,
        isPlatformBrowser(this.platformId) && this.initialShop !== undefined
      );
      if (!shop) {
        this.notFound.set(true);
        this.catalogLoading.set(false);
        return;
      }
      this.shop.set(shop);
      const name = shop.name ?? 'Dukarun shop';
      this.seo.set(
        `${name} | Dukarun shops`,
        `Browse ${name} and order directly on WhatsApp.`,
        `/${slug}`
      );
      this.seo.setStructuredData(this.shopStructuredData(shop, slug));
      if (shop.catalogue_visible && isPlatformBrowser(this.platformId)) {
        try {
          const [catalog, collections] = await Promise.all([
            this.storefront.catalog(slug),
            this.storefront.collections(slug),
          ]);
          this.catalog.set(catalog);
          this.collections.set(collections);
        } catch {
          this.catalogError.set(true);
        } finally {
          this.catalogLoading.set(false);
        }
      } else if (!shop.catalogue_visible) {
        this.catalogLoading.set(false);
      }
    } catch (err) {
      this.catalogLoading.set(false);
      if (this.shop()) {
        this.catalogError.set(true);
      } else {
        this.error.set(err instanceof Error ? err.message : 'Failed to load this shop');
      }
    }
  }

  protected label(item: CatalogRow): string {
    if (!item.variant_name || item.variant_name === 'Default') return item.product_name ?? '';
    return `${item.product_name}: ${item.variant_name}`;
  }

  private searchTokens(value: string): string[] {
    return value.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  protected fmt = formatKes;

  protected imageUrl(path: string | null): string | null {
    return this.storefront.imageUrl(path);
  }

  protected waLink(phone: string, text: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }

  private shopStructuredData(shop: StorefrontInfo, slug: string): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: shop.name ?? 'Dukarun shop',
      url: new URL(
        `/${slug}`,
        `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
      ).toString(),
      telephone: shop.public_whatsapp_number,
      image: this.imageUrl(shop.logo_path),
    };
  }
}
