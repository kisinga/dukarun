import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ProductCardComponent, ProductCardVM } from '../../core/components/product-card.component';
import { SkeletonGridComponent } from '../../core/components/skeleton-grid.component';
import { COLLECTION_DETAIL } from '@dukarun-st/collection';
import { SEARCH_PRODUCTS } from '@dukarun-st/product';
import { ApolloService } from '../../core/services/apollo.service';
import { CurrencyService } from '../../core/services/currency.service';
import { SeoService } from '../../core/services/seo.service';
import { StorefrontStateService } from '../../core/services/storefront-state.service';
import { buildManufacturerMap, manufacturerOf } from '../../core/utils/facet.util';

const PAGE_SIZE = 24;

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [RouterLink, ProductCardComponent, SkeletonGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="mb-3 text-sm text-base-content/60">
      <a routerLink="/" class="hover:text-primary">Home</a>
      <span class="mx-1">/</span>
      <span class="text-base-content">{{ name() || '…' }}</span>
    </nav>

    @if (loading()) {
      <div class="mb-4 flex flex-col gap-2">
        <div class="skeleton h-7 w-48"></div>
      </div>
      <app-skeleton-grid [count]="8" />
    } @else if (!name()) {
      <p class="py-20 text-center text-base-content/60">Collection not found.</p>
    } @else {
      <section class="flex flex-col gap-4">
        <header>
          <h1 class="text-2xl font-bold">{{ name() }}</h1>
          @if (description()) {
            <p class="mt-1 text-base-content/70">{{ description() }}</p>
          }
        </header>
        @if (products().length === 0) {
          <p class="py-12 text-center text-base-content/60">No products in this collection.</p>
        } @else {
          <span class="text-sm text-base-content/60">
            {{ total() }} {{ total() === 1 ? 'product' : 'products' }}
          </span>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            @for (p of products(); track p.slug) {
              <app-product-card [product]="p" />
            }
          </div>
          @if (hasMore()) {
            <div class="flex justify-center pt-2">
              <button
                type="button"
                class="btn btn-outline btn-wide gap-2"
                (click)="loadMore()"
                [disabled]="loadingMore()"
              >
                @if (loadingMore()) {
                  <span class="loading loading-spinner loading-sm"></span>
                }
                Load more
              </button>
            </div>
          }
        }
      </section>
    }
  `,
})
export class CollectionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apollo = inject(ApolloService);
  private readonly currency = inject(CurrencyService);
  private readonly seo = inject(SeoService);
  private readonly state = inject(StorefrontStateService);

  readonly slug = signal('');
  readonly name = signal('');
  readonly description = signal('');
  readonly products = signal<ProductCardVM[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);

  readonly hasMore = computed(() => this.products().length < this.total());

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(pm => {
      const slug = pm.get('slug');
      if (slug) void this.load(slug);
    });
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    try {
      const page = await this.fetchPage(this.slug(), this.products().length);
      this.products.update(list => [...list, ...page.items]);
      this.total.set(page.total);
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.slug.set(slug);
    await this.state.resolve();
    try {
      const [detail, page] = await Promise.all([
        this.apollo.getClient().query({
          query: COLLECTION_DETAIL,
          variables: { slug },
          fetchPolicy: 'cache-first',
        }),
        this.fetchPage(slug, 0),
      ]);
      const c = detail.data?.collection;
      this.name.set(c?.name ?? '');
      this.description.set(c?.description ?? '');
      this.products.set(page.items);
      this.total.set(page.total);

      const store = this.state.store();
      if (c && store) {
        this.seo.setPage({
          title: `${c.name} · ${store.name}`,
          description: c.description || `Browse ${c.name} at ${store.name}.`,
          image: c.featuredAsset?.preview ?? store.logoUrl,
          canonicalPath: `/collections/${c.slug}`,
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchPage(
    slug: string,
    skip: number
  ): Promise<{ items: ProductCardVM[]; total: number }> {
    const res = await this.apollo.getClient().query({
      query: SEARCH_PRODUCTS,
      variables: {
        input: { collectionSlug: slug, groupByProduct: true, take: PAGE_SIZE, skip },
      },
      fetchPolicy: 'cache-first',
    });
    const search = res.data?.search;
    const mfrMap = buildManufacturerMap(search?.facetValues);
    return {
      items: (search?.items ?? []).map(i => this.toCard(i, mfrMap)),
      total: search?.totalItems ?? 0,
    };
  }

  private toCard(
    item: {
      slug: string;
      productName: string;
      productAsset?: { preview: string } | null;
      priceWithTax: { min: number; max: number } | { value: number };
      currencyCode: string;
      inStock: boolean;
      facetValueIds: readonly string[];
    },
    mfrMap: Map<string, string>
  ): ProductCardVM {
    return {
      slug: item.slug,
      name: item.productName,
      imageUrl: item.productAsset?.preview ?? null,
      price: this.currency.formatSearchPrice(item.priceWithTax, item.currencyCode),
      inStock: item.inStock,
      manufacturer: manufacturerOf(item.facetValueIds, mfrMap),
    };
  }
}
