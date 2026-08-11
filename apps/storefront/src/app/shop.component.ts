import { Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogProduct, groupCatalog } from './catalog.models';
import { ShopCollection, StorefrontInfo, StorefrontService } from './storefront.service';
import { StorefrontBrandComponent } from './storefront-brand.component';
import { StorefrontSeoService } from './storefront-seo.service';
import { environment } from '../environments/environment';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';

const PAGE_SIZE = 12;

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

@Component({
  selector: 'app-shop',
  imports: [RouterLink, StorefrontBrandComponent, PoweredByDukarunComponent],
  template: `
    <main class="min-h-screen bg-base-200 pb-24">
      @if (notFound()) {
        <div class="mx-auto max-w-lg px-5 py-24 text-center">
          <p class="text-3xl font-bold tracking-tight">We couldn't find that shop</p>
          <p class="mt-3 text-base text-base-content/60">
            Check the link, or browse other Dukarun shops.
          </p>
          <a routerLink="/" class="btn btn-primary mt-7 min-h-11 px-6">Browse shops</a>
        </div>
      } @else if (shop(); as s) {
        <header class="border-b border-base-300 bg-base-100/95">
          <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <app-storefront-brand
              [name]="s.name"
              [logoUrl]="companyLogoUrl(s.logo_path)"
              [compact]="true"
            />
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-lg font-bold tracking-tight sm:text-xl">{{ s.name }}</h1>
              <p class="truncate text-xs text-base-content/55 sm:text-sm">
                Local catalogue · direct ordering
              </p>
            </div>
            @if (s.public_whatsapp_number) {
              <a
                [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
                target="_blank"
                rel="noopener"
                class="btn btn-ghost min-h-11 border border-base-300 bg-base-100 px-3 sm:px-5"
                >Chat <span class="hidden sm:inline">on WhatsApp</span></a
              >
            }
          </div>
        </header>

        <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          @if (!s.catalogue_visible) {
            <section
              class="mx-auto mt-8 max-w-xl rounded-3xl border border-base-300 bg-base-100 p-8 text-center"
            >
              <app-storefront-brand [name]="s.name" [logoUrl]="companyLogoUrl(s.logo_path)" />
              <h2 class="mt-5 text-2xl font-bold">The catalogue is taking a break</h2>
              <p class="mx-auto mt-2 max-w-sm text-base-content/60">
                You can still contact {{ s.name }} directly to ask what is available.
              </p>
              @if (s.public_whatsapp_number) {
                <a
                  [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-primary mt-6 min-h-12 px-6"
                  >Message the shop</a
                >
              }
            </section>
          } @else {
            <section class="overflow-hidden rounded-3xl border border-base-300 bg-base-100">
              <div class="grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <p class="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                    Welcome to {{ s.name }}
                  </p>
                  <h2
                    class="mt-2 max-w-2xl text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
                  >
                    Good things, easy to find.
                  </h2>
                  <p class="mt-3 max-w-xl text-sm leading-6 text-base-content/60 sm:text-base">
                    Browse the latest products, choose an option, then order directly from the shop
                    on WhatsApp.
                  </p>
                </div>
                <div class="rounded-2xl bg-[#f7ded3] px-5 py-4 text-sm text-[#78301d]">
                  <p class="font-semibold">Simple, direct ordering</p>
                  <p class="mt-1 opacity-75">No account or checkout required.</p>
                </div>
              </div>
            </section>

            <section class="mt-7" aria-label="Catalogue controls">
              <label for="catalog-search" class="mb-2 block text-sm font-semibold"
                >What are you looking for?</label
              >
              <div class="relative">
                <input
                  id="catalog-search"
                  type="search"
                  class="search-with-custom-clear input min-h-13 w-full border-base-300 bg-base-100 pr-24 text-base shadow-none focus:border-primary"
                  placeholder="Search products, brands or SKUs"
                  [value]="query()"
                  (input)="setQuery($any($event.target).value)"
                />
                @if (query()) {
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm absolute top-2 right-2"
                    (click)="setQuery('')"
                  >
                    Clear
                  </button>
                }
              </div>

              @if (collections().length) {
                <div
                  class="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
                  aria-label="Product collections"
                >
                  <button
                    type="button"
                    class="btn btn-sm shrink-0 rounded-full px-5"
                    [class.btn-primary]="selectedCollection() === null"
                    [class.btn-ghost]="selectedCollection() !== null"
                    (click)="selectCollection(null)"
                  >
                    All products
                  </button>
                  @for (collection of collections(); track collection.id) {
                    <button
                      type="button"
                      class="btn btn-sm shrink-0 rounded-full px-5"
                      [class.btn-primary]="selectedCollection() === collection.id"
                      [class.btn-ghost]="selectedCollection() !== collection.id"
                      (click)="selectCollection(collection.id)"
                    >
                      {{ collection.name }}
                    </button>
                  }
                </div>
              }
            </section>

            @if (catalogLoading()) {
              <div class="grid grid-cols-2 gap-3 pt-8 sm:grid-cols-3 lg:grid-cols-4">
                @for (item of skeletons; track $index) {
                  <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
                    <div class="skeleton aspect-square rounded-none"></div>
                    <div class="space-y-2 p-4">
                      <div class="skeleton h-3 w-1/2"></div>
                      <div class="skeleton h-5 w-full"></div>
                      <div class="skeleton h-5 w-2/3"></div>
                    </div>
                  </div>
                }
              </div>
            } @else if (catalogError()) {
              <div class="mt-8 rounded-2xl border border-error/25 bg-base-100 p-8 text-center">
                <p class="font-semibold">The catalogue couldn't load</p>
                <p class="mt-1 text-sm text-base-content/60">
                  Check your connection and try again.
                </p>
                <button type="button" class="btn btn-outline mt-5 min-h-11" (click)="loadCatalog()">
                  Try again
                </button>
              </div>
            } @else {
              <div class="mt-8 flex items-end justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold tracking-[0.14em] text-base-content/45 uppercase">
                    Catalogue
                  </p>
                  <h2 class="mt-1 text-2xl font-bold">{{ activeCollectionName() }}</h2>
                </div>
                <p class="text-sm text-base-content/55">
                  {{ resultCount() }} {{ resultCount() === 1 ? 'product' : 'products' }}
                </p>
              </div>

              @if (pagedProducts().length) {
                <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                  @for (product of pagedProducts(); track product.id) {
                    <a
                      [routerLink]="['/', slug, 'products', product.id]"
                      class="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
                    >
                      <div class="relative aspect-square overflow-hidden bg-[#eee8df]">
                        @if (imageUrl(product.imagePath); as image) {
                          <img
                            [src]="image"
                            [alt]="product.name"
                            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
                            loading="lazy"
                          />
                        } @else {
                          <div
                            class="grid h-full place-content-center bg-gradient-to-br from-[#f3eee7] to-[#e8dfd3] text-center text-base-content/30"
                          >
                            <span
                              class="rounded-full border border-current/20 bg-white/25 px-3 py-1 text-[0.65rem] font-semibold tracking-widest uppercase"
                              >Photo coming soon</span
                            >
                          </div>
                        }
                        @if (!product.available) {
                          <span class="badge badge-neutral absolute right-3 bottom-3"
                            >Unavailable</span
                          >
                        }
                      </div>
                      <div class="flex flex-1 flex-col p-3.5 sm:p-4">
                        @if (product.manufacturer) {
                          <p
                            class="truncate text-[0.68rem] font-semibold tracking-[0.12em] text-base-content/45 uppercase"
                          >
                            {{ product.manufacturer }}
                          </p>
                        }
                        <h3
                          class="mt-1 line-clamp-2 text-sm leading-snug font-semibold group-hover:text-primary sm:text-base"
                        >
                          {{ product.name }}
                        </h3>
                        @if (product.variants.length > 1) {
                          <p class="mt-1 text-xs text-base-content/45">
                            {{ product.variants.length }} options
                          </p>
                        }
                        <p class="mt-auto pt-3 text-base font-bold tabular-nums text-primary">
                          {{ productPrice(product) }}
                        </p>
                      </div>
                    </a>
                  }
                </div>

                @if (pageCount() > 1) {
                  <nav
                    class="mt-8 flex flex-col items-center justify-between gap-4 border-t border-base-300 pt-6 sm:flex-row"
                    aria-label="Product pages"
                  >
                    <p class="text-sm text-base-content/55">
                      Showing {{ firstResult() }}–{{ lastResult() }} of {{ resultCount() }}
                    </p>
                    <div class="join">
                      <button
                        type="button"
                        class="btn join-item min-h-11"
                        [disabled]="page() === 1"
                        (click)="goToPage(page() - 1)"
                      >
                        Previous
                      </button>
                      @for (number of visiblePages(); track number) {
                        <button
                          type="button"
                          class="btn join-item min-h-11 min-w-11"
                          [class.btn-primary]="number === page()"
                          (click)="goToPage(number)"
                          [attr.aria-current]="number === page() ? 'page' : null"
                        >
                          {{ number }}
                        </button>
                      }
                      <button
                        type="button"
                        class="btn join-item min-h-11"
                        [disabled]="page() === pageCount()"
                        (click)="goToPage(page() + 1)"
                      >
                        Next
                      </button>
                    </div>
                  </nav>
                }
              } @else {
                <div
                  class="mt-4 rounded-2xl border border-dashed border-base-300 bg-base-100 px-5 py-14 text-center"
                >
                  <p class="text-lg font-semibold">No matching products</p>
                  <p class="mt-1 text-sm text-base-content/55">
                    Try another search or browse all products.
                  </p>
                  @if (query() || selectedCollection()) {
                    <button
                      type="button"
                      class="btn btn-outline mt-5 min-h-11"
                      (click)="resetFilters()"
                    >
                      Reset filters
                    </button>
                  }
                </div>
              }
            }
          }
        </div>

        @if (s.public_whatsapp_number && s.catalogue_visible) {
          <a
            [href]="waLink(s.public_whatsapp_number, 'Hello ' + s.name + '!')"
            target="_blank"
            rel="noopener"
            class="btn btn-primary fixed right-4 bottom-4 z-40 min-h-12 rounded-full px-6 shadow-lg sm:hidden"
            >Ask the shop</a
          >
        }
        <footer class="mx-auto max-w-6xl px-5 pb-10 text-center text-xs text-base-content/45">
          <app-powered-by-dukarun /><span aria-hidden="true"> · </span
          ><a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a
          ><span aria-hidden="true"> · </span
          ><a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </footer>
      } @else if (!error()) {
        <div class="mx-auto max-w-6xl px-4 py-20">
          <div class="skeleton h-20 w-full rounded-3xl"></div>
        </div>
      }
      @if (error()) {
        <div class="mx-auto max-w-lg px-5 py-24 text-center">
          <p class="font-semibold text-error">{{ error() }}</p>
        </div>
      }
    </main>
  `,
})
export class ShopComponent implements OnInit, OnDestroy {
  private readonly storefront = inject(StorefrontService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly initialShop = this.slug
    ? this.storefront.transferredStorefront(this.slug)
    : undefined;
  private readonly initialCatalog = this.slug
    ? this.storefront.transferredCatalogPage(this.slug, PAGE_SIZE)
    : null;
  private readonly initialCollections = this.slug
    ? this.storefront.transferredCollections(this.slug)
    : null;

  protected readonly shop = signal<StorefrontInfo | null>(this.initialShop ?? null);
  protected readonly products = signal<CatalogProduct[]>(
    groupCatalog(this.initialCatalog?.rows ?? [])
  );
  protected readonly collections = signal<ShopCollection[]>(this.initialCollections ?? []);
  protected readonly selectedCollection = signal<string | null>(null);
  protected readonly catalogLoading = signal(this.initialCatalog === null);
  protected readonly catalogError = signal(false);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly page = signal(
    this.initialCatalog ? Math.floor(this.initialCatalog.offset / PAGE_SIZE) + 1 : 1
  );
  protected readonly resultCount = signal(this.initialCatalog?.total ?? 0);
  protected readonly skeletons = Array.from({ length: 8 });
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private requestSequence = 0;

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.resultCount() / PAGE_SIZE))
  );
  protected readonly pagedProducts = this.products;
  protected readonly firstResult = computed(() =>
    this.resultCount() ? (this.page() - 1) * PAGE_SIZE + 1 : 0
  );
  protected readonly lastResult = computed(() =>
    Math.min(this.page() * PAGE_SIZE, this.resultCount())
  );
  protected readonly activeCollectionName = computed(
    () =>
      this.collections().find(collection => collection.id === this.selectedCollection())?.name ??
      'All products'
  );
  protected readonly visiblePages = computed(() => {
    const count = this.pageCount();
    const current = this.page();
    const start = Math.max(1, Math.min(current - 1, count - 2));
    return Array.from({ length: Math.min(3, count) }, (_, index) => start + index);
  });

  async ngOnInit(): Promise<void> {
    if (!this.slug) {
      this.seo.set('Shop not found', 'This shop could not be found.', '/', true);
      this.notFound.set(true);
      this.catalogLoading.set(false);
      return;
    }
    try {
      const shop = await this.storefront.storefront(
        this.slug,
        isPlatformBrowser(this.platformId) && this.initialShop !== undefined
      );
      if (!shop) {
        this.seo.set('Shop not found', 'This shop could not be found.', `/${this.slug}`, true);
        this.notFound.set(true);
        this.catalogLoading.set(false);
        return;
      }
      this.shop.set(shop);
      this.seo.set(
        `${shop.name} | Dukarun shops`,
        `Browse ${shop.name} and order directly on WhatsApp.`,
        `/${this.slug}`,
        !shop.catalogue_visible,
        this.companyLogoUrl(shop.logo_path)
      );
      this.seo.setStructuredData(this.shopStructuredData(shop));
      if (shop.catalogue_visible) {
        const refreshTransferredData =
          isPlatformBrowser(this.platformId) && this.initialCatalog !== null;
        const [, collections] = await Promise.all([
          this.loadCatalog(refreshTransferredData, refreshTransferredData),
          this.storefront.collections(this.slug, refreshTransferredData),
        ]);
        this.collections.set(collections);
      } else {
        this.catalogLoading.set(false);
      }
    } catch (err) {
      this.catalogLoading.set(false);
      if (this.shop()) this.catalogError.set(true);
      else this.error.set(err instanceof Error ? err.message : 'Failed to load this shop');
    }
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected async loadCatalog(force = false, preserveRenderedContent = false): Promise<void> {
    await this.loadPage(this.page(), force, preserveRenderedContent);
  }

  private async loadPage(
    requestedPage: number,
    force = false,
    preserveRenderedContent = false
  ): Promise<void> {
    const nextPage = Math.max(1, requestedPage);
    const request = ++this.requestSequence;
    if (!preserveRenderedContent) {
      this.catalogLoading.set(true);
      this.catalogError.set(false);
    }
    try {
      const result = await this.storefront.catalogPage(this.slug, {
        search: this.query(),
        collectionId: this.selectedCollection(),
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
        force,
      });
      if (request !== this.requestSequence) return;
      this.page.set(Math.floor(result.offset / PAGE_SIZE) + 1);
      this.resultCount.set(result.total);
      this.products.set(groupCatalog(result.rows));
    } catch {
      if (request === this.requestSequence && !preserveRenderedContent) {
        this.catalogError.set(true);
      }
    } finally {
      if (request === this.requestSequence && !preserveRenderedContent) {
        this.catalogLoading.set(false);
      }
    }
  }

  protected async selectCollection(id: string | null): Promise<void> {
    if (id === this.selectedCollection()) return;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.selectedCollection.set(id);
    await this.loadPage(1);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.loadPage(1), 300);
  }
  protected resetFilters(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.query.set('');
    this.selectedCollection.set(null);
    void this.loadPage(1);
  }
  protected goToPage(page: number): void {
    const nextPage = Math.max(1, Math.min(page, this.pageCount()));
    void this.loadPage(nextPage);
    if (isPlatformBrowser(this.platformId)) window.scrollTo({ top: 420, behavior: 'smooth' });
  }
  protected productPrice(product: CatalogProduct): string {
    return product.minPrice === product.maxPrice
      ? formatKes(product.minPrice)
      : `${formatKes(product.minPrice)}–${formatKes(product.maxPrice)}`;
  }
  protected imageUrl(path: string | null): string | null {
    return this.storefront.imageUrl(path);
  }
  protected companyLogoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }
  protected waLink(phone: string, text: string): string {
    return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
  }
  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
  private shopStructuredData(shop: StorefrontInfo): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: shop.name,
      url: new URL(
        `/${this.slug}`,
        `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
      ).toString(),
      telephone: shop.public_whatsapp_number,
      image: this.companyLogoUrl(shop.logo_path),
    };
  }
}
