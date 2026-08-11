import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogProduct, catalogLabel, groupCatalog, isVariantAvailable } from './catalog.models';
import { CatalogRow, StorefrontInfo, StorefrontService } from './storefront.service';
import { StorefrontBrandComponent } from './storefront-brand.component';
import { StorefrontSeoService } from './storefront-seo.service';
import { environment } from '../environments/environment';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, StorefrontBrandComponent, PoweredByDukarunComponent],
  template: `
    <main class="min-h-screen bg-base-200 pb-24">
      @if (shop(); as s) {
        <header class="border-b border-base-300 bg-base-100/95">
          <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <a [routerLink]="['/', shopSlug]" class="flex min-w-0 flex-1 items-center gap-3">
              <app-storefront-brand
                [name]="s.name"
                [logoUrl]="companyLogoUrl(s.logo_path)"
                [compact]="true"
              />
              <div class="min-w-0">
                <p class="truncate text-lg font-bold">{{ s.name }}</p>
                <p class="text-xs text-base-content/50">Back to the catalogue</p>
              </div>
            </a>
            @if (s.public_whatsapp_number) {
              <a
                [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
                target="_blank"
                rel="noopener"
                class="btn btn-ghost min-h-11 border border-base-300 bg-base-100"
                >Chat</a
              >
            }
          </div>
        </header>

        <div class="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-9">
          <nav
            class="mb-5 flex min-w-0 items-center gap-2 text-sm text-base-content/50"
            aria-label="Breadcrumb"
          >
            <a [routerLink]="['/', shopSlug]" class="hover:text-primary">Catalogue</a
            ><span aria-hidden="true">/</span
            ><span class="truncate text-base-content/75">{{ product()?.name ?? 'Product' }}</span>
          </nav>

          @if (loading()) {
            <div class="grid gap-6 md:grid-cols-2">
              <div class="skeleton aspect-square rounded-3xl"></div>
              <div class="space-y-4 py-4">
                <div class="skeleton h-4 w-28"></div>
                <div class="skeleton h-10 w-3/4"></div>
                <div class="skeleton h-8 w-40"></div>
                <div class="skeleton mt-8 h-14 w-full"></div>
              </div>
            </div>
          } @else if (loadError()) {
            <div
              class="mx-auto max-w-lg rounded-3xl border border-error/25 bg-base-100 px-6 py-16 text-center"
            >
              <h1 class="text-2xl font-bold">The product couldn't load</h1>
              <p class="mt-2 text-base-content/55">
                Check your connection, then return to the catalogue and try again.
              </p>
              <a [routerLink]="['/', shopSlug]" class="btn btn-primary mt-6 min-h-11"
                >Return to catalogue</a
              >
            </div>
          } @else if (product(); as p) {
            <article class="grid gap-7 md:grid-cols-2 md:gap-12">
              <section aria-label="Product photos">
                <div
                  class="aspect-square overflow-hidden rounded-3xl border border-base-300 bg-[#eee8df]"
                >
                  @if (imageUrl(p.imagePath); as image) {
                    <img [src]="image" [alt]="p.name" class="h-full w-full object-cover" />
                  } @else {
                    <div
                      class="grid h-full place-content-center bg-gradient-to-br from-[#f3eee7] to-[#e8dfd3] text-center text-base-content/30"
                    >
                      <span
                        class="rounded-full border border-current/20 bg-white/25 px-4 py-2 text-xs font-semibold tracking-[0.16em] uppercase"
                        >Photo coming soon</span
                      >
                    </div>
                  }
                </div>
              </section>

              <section class="flex flex-col md:py-3">
                @if (p.manufacturer) {
                  <p class="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                    {{ p.manufacturer }}
                  </p>
                }
                <h1 class="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                  {{ p.name }}
                </h1>
                @if (selectedVariant(); as variant) {
                  <div class="mt-5 flex flex-wrap items-center gap-3">
                    <p class="text-2xl font-bold tabular-nums text-primary">
                      {{ fmt(variant.price) }}
                    </p>
                    <span
                      class="badge px-3 py-3"
                      [class.badge-success]="available(variant)"
                      [class.badge-ghost]="!available(variant)"
                      >{{ available(variant) ? 'Available' : 'Currently unavailable' }}</span
                    >
                  </div>
                }

                @if (p.variants.length > 1) {
                  <fieldset class="mt-8">
                    <legend class="text-sm font-semibold">Choose an option</legend>
                    <div class="mt-3 flex flex-wrap gap-2">
                      @for (variant of p.variants; track variant.variant_id) {
                        <button
                          type="button"
                          class="btn min-h-11 rounded-xl"
                          [class.btn-primary]="variant.variant_id === selectedVariantId()"
                          [class.btn-outline]="variant.variant_id !== selectedVariantId()"
                          (click)="selectVariant(variant)"
                          [disabled]="!available(variant)"
                        >
                          {{ variant.variant_name }}
                        </button>
                      }
                    </div>
                  </fieldset>
                }

                @if (selectedVariant(); as variant) {
                  <div class="mt-8 rounded-2xl border border-base-300 bg-base-100 p-4 text-sm">
                    <div class="flex justify-between gap-4">
                      <span class="text-base-content/55">Product</span
                      ><span class="text-right font-medium">{{ catalogLabel(variant) }}</span>
                    </div>
                    @if (variant.sku) {
                      <div class="mt-3 flex justify-between gap-4 border-t border-base-300 pt-3">
                        <span class="text-base-content/55">Reference</span
                        ><span class="font-mono text-xs">{{ variant.sku }}</span>
                      </div>
                    }
                    <div class="mt-3 flex justify-between gap-4 border-t border-base-300 pt-3">
                      <span class="text-base-content/55">Ordering</span
                      ><span class="text-right">Confirm directly with {{ s.name }}</span>
                    </div>
                  </div>
                }

                @if (orderLink(); as href) {
                  <a
                    [href]="href"
                    target="_blank"
                    rel="noopener"
                    class="btn btn-primary mt-5 min-h-14 w-full rounded-2xl text-base"
                    [class.btn-disabled]="selectedVariant() && !available(selectedVariant()!)"
                    >Order this on WhatsApp</a
                  >
                  <p class="mt-2 text-center text-xs text-base-content/45">
                    We'll prepare the product name, option and price for you.
                  </p>
                } @else {
                  <p class="mt-6 rounded-2xl bg-base-300/50 p-4 text-sm text-base-content/60">
                    Contact the shop directly to order this item.
                  </p>
                }
              </section>
            </article>
          } @else {
            <div
              class="mx-auto max-w-lg rounded-3xl border border-base-300 bg-base-100 px-6 py-16 text-center"
            >
              <h1 class="text-2xl font-bold">Product not found</h1>
              <p class="mt-2 text-base-content/55">It may no longer be listed in this shop.</p>
              <a [routerLink]="['/', shopSlug]" class="btn btn-primary mt-6 min-h-11"
                >Return to catalogue</a
              >
            </div>
          }
        </div>
        <footer class="mx-auto max-w-6xl px-5 pb-10 text-center text-xs text-base-content/45">
          <app-powered-by-dukarun />
        </footer>
      } @else if (!loading()) {
        <div class="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 class="text-2xl font-bold">Shop not found</h1>
          <a routerLink="/" class="btn btn-primary mt-6">Browse shops</a>
        </div>
      }
    </main>
  `,
})
export class ProductDetailComponent implements OnInit {
  private readonly storefront = inject(StorefrontService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly shopSlug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly productId = this.route.snapshot.paramMap.get('productId') ?? '';
  protected readonly shop = signal<StorefrontInfo | null>(null);
  protected readonly product = signal<CatalogProduct | null>(null);
  protected readonly selectedVariantId = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly selectedVariant = computed(
    () =>
      this.product()?.variants.find(variant => variant.variant_id === this.selectedVariantId()) ??
      this.product()?.variants[0] ??
      null
  );
  protected readonly orderLink = computed(() => {
    const shop = this.shop();
    const variant = this.selectedVariant();
    if (!shop?.public_whatsapp_number || !variant || !isVariantAvailable(variant)) return null;
    const pageUrl = isPlatformBrowser(this.platformId)
      ? window.location.href
      : new URL(
          `/${this.shopSlug}/products/${this.productId}`,
          `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
        ).toString();
    return this.waLink(
      shop.public_whatsapp_number,
      `Hello ${shop.name}! I'd like to order ${catalogLabel(variant)} for ${formatKes(Number(variant.price))}. ${pageUrl}`
    );
  });

  async ngOnInit(): Promise<void> {
    try {
      const shop = await this.storefront.storefront(this.shopSlug);
      this.shop.set(shop);
      if (!shop?.catalogue_visible) {
        this.seo.set(
          'Product not found',
          'This product is not available.',
          `/${this.shopSlug}/products/${this.productId}`,
          true
        );
        return;
      }
      const product =
        groupCatalog(await this.storefront.product(this.shopSlug, this.productId))[0] ?? null;
      this.product.set(product);
      const firstAvailable = product?.variants.find(isVariantAvailable) ?? product?.variants[0];
      this.selectedVariantId.set(firstAvailable?.variant_id ?? null);
      if (product) this.applySeo(shop, product);
      else
        this.seo.set(
          'Product not found',
          'This product is not available.',
          `/${this.shopSlug}/products/${this.productId}`,
          true
        );
    } catch {
      this.loadError.set(true);
      this.seo.set(
        'Product unavailable',
        'This product could not be loaded.',
        `/${this.shopSlug}/products/${this.productId}`,
        true
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected selectVariant(variant: CatalogRow): void {
    this.selectedVariantId.set(variant.variant_id);
  }
  protected available(variant: CatalogRow): boolean {
    return isVariantAvailable(variant);
  }
  protected catalogLabel = catalogLabel;
  protected fmt = formatKes;
  protected imageUrl(path: string | null): string | null {
    return this.storefront.imageUrl(path);
  }
  protected companyLogoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }
  protected waLink(phone: string, text: string): string {
    return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
  }
  private applySeo(shop: StorefrontInfo, product: CatalogProduct): void {
    const path = `/${this.shopSlug}/products/${this.productId}`;
    this.seo.set(
      `${product.name} · ${shop.name}`,
      `View ${product.name} at ${shop.name} and order on WhatsApp.`,
      path,
      false,
      this.imageUrl(product.imagePath),
      'product'
    );
    this.seo.setStructuredData({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      image: this.imageUrl(product.imagePath),
      brand: product.manufacturer ? { '@type': 'Brand', name: product.manufacturer } : undefined,
      offers: product.variants.map(variant => ({
        '@type': 'Offer',
        price: Number(variant.price),
        priceCurrency: 'KES',
        availability: isVariantAvailable(variant)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        url: new URL(path, `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`).toString(),
      })),
    });
  }
}
