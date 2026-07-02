import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ProductCardComponent, ProductCardVM } from '../../core/components/product-card.component';
import { SkeletonGridComponent } from '../../core/components/skeleton-grid.component';
import { StoreAvatarComponent } from '../../core/components/store-avatar.component';
import { COLLECTIONS, SEARCH_PRODUCTS } from '../../core/graphql/operations.graphql';
import { ApolloService } from '../../core/services/apollo.service';
import { CurrencyService } from '../../core/services/currency.service';
import { SeoService } from '../../core/services/seo.service';
import { StorefrontStateService } from '../../core/services/storefront-state.service';
import { buildManufacturerMap, manufacturerOf } from '../../core/utils/facet.util';
import { buildWhatsAppLink } from '../../core/utils/whatsapp.util';

interface CollectionChip {
  slug: string;
  name: string;
}

const PAGE_SIZE = 24;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, ProductCardComponent, SkeletonGridComponent, StoreAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-5">
      <div
        class="flex flex-col items-center gap-3 rounded-box border border-base-300 bg-gradient-to-br from-base-100 to-base-200 p-5 text-center sm:flex-row sm:gap-4 sm:text-left"
      >
        <app-store-avatar
          [name]="storeName()"
          [logoUrl]="storeLogo()"
          boxClass="h-16 w-16 rounded-box shadow-sm shrink-0"
        />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-2xl font-bold">{{ storeName() }}</h1>
          <p class="text-sm text-base-content/60">Browse our products and order in a tap on WhatsApp.</p>
        </div>
        @if (whatsappHref(); as href) {
          <a [href]="href" target="_blank" rel="noopener" class="btn btn-primary w-full gap-2 sm:w-auto">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.393l-.999 3.648 3.9-1.34z" />
            </svg>
            Chat with us
          </a>
        }
      </div>

      <form class="join w-full" (submit)="onSearch($event)">
        <input
          type="search"
          name="q"
          class="input input-bordered input-lg join-item w-full text-base"
          placeholder="Search products…"
          [ngModel]="term()"
          (ngModelChange)="term.set($event)"
          aria-label="Search products"
        />
        <button type="submit" class="btn btn-primary btn-lg join-item" aria-label="Search">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <span class="hidden sm:inline">Search</span>
        </button>
      </form>

      @if (collections().length) {
        <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          @for (c of collections(); track c.slug) {
            <a
              [routerLink]="['/collections', c.slug]"
              class="btn btn-sm btn-outline whitespace-nowrap rounded-full"
            >{{ c.name }}</a>
          }
        </div>
      }

      @if (loading()) {
        <app-skeleton-grid [count]="8" />
      } @else if (products().length === 0) {
        <div class="flex flex-col items-center gap-2 py-20 text-center text-base-content/60">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <p>No products found@if (term()) { for “{{ term() }}”}.</p>
        </div>
      } @else {
        <div class="flex items-center justify-between">
          <span class="text-sm text-base-content/60">
            {{ total() }} {{ total() === 1 ? 'product' : 'products' }}
          </span>
        </div>
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
  `,
})
export class HomeComponent implements OnInit {
  private readonly apollo = inject(ApolloService);
  private readonly currency = inject(CurrencyService);
  private readonly seo = inject(SeoService);
  private readonly state = inject(StorefrontStateService);

  readonly term = signal('');
  readonly products = signal<ProductCardVM[]>([]);
  readonly total = signal(0);
  readonly collections = signal<CollectionChip[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);

  /** Generation counter; a new search() bumps it so late load-more/search responses are dropped. */
  private seq = 0;

  readonly hasMore = computed(() => this.products().length < this.total());

  readonly storeName = computed(() => this.state.store()?.name ?? '');
  readonly storeLogo = computed(() => this.state.store()?.logoUrl ?? null);
  readonly whatsappHref = computed(() => {
    const num = this.state.store()?.whatsappNumber;
    return num
      ? buildWhatsAppLink(num, `Hello ${this.storeName()}! I have a question about your products.`)
      : null;
  });

  async ngOnInit(): Promise<void> {
    await this.state.resolve();
    const store = this.state.store();
    if (store) {
      this.seo.setPage({
        title: store.name,
        description: `Browse products from ${store.name}. Order easily via WhatsApp.`,
        image: store.logoUrl,
        canonicalPath: '/',
      });
    }
    await Promise.all([this.loadCollections(), this.search()]);
  }

  onSearch(event: Event): void {
    event.preventDefault();
    void this.search();
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) return;
    const gen = this.seq;
    this.loadingMore.set(true);
    try {
      const page = await this.fetchPage(this.products().length);
      if (gen !== this.seq) return; // a new search superseded this page — drop it
      this.products.update(list => [...list, ...page.items]);
      this.total.set(page.total);
    } finally {
      if (gen === this.seq) this.loadingMore.set(false);
    }
  }

  private async search(): Promise<void> {
    const gen = ++this.seq;
    this.loading.set(true);
    try {
      const page = await this.fetchPage(0);
      if (gen !== this.seq) return; // superseded by a newer search
      this.products.set(page.items);
      this.total.set(page.total);
    } finally {
      if (gen === this.seq) this.loading.set(false);
    }
  }

  private async fetchPage(skip: number): Promise<{ items: ProductCardVM[]; total: number }> {
    const res = await this.apollo.getClient().query({
      query: SEARCH_PRODUCTS,
      variables: {
        input: { term: this.term().trim(), groupByProduct: true, take: PAGE_SIZE, skip },
      },
      fetchPolicy: 'network-only',
    });
    const search = res.data?.search;
    const mfrMap = buildManufacturerMap(search?.facetValues);
    return {
      items: (search?.items ?? []).map(i => this.toCard(i, mfrMap)),
      total: search?.totalItems ?? 0,
    };
  }

  private async loadCollections(): Promise<void> {
    try {
      const res = await this.apollo.getClient().query({
        query: COLLECTIONS,
        variables: { options: { take: 12 } },
        fetchPolicy: 'cache-first',
      });
      this.collections.set(
        (res.data?.collections.items ?? []).map(c => ({ slug: c.slug, name: c.name }))
      );
    } catch {
      this.collections.set([]);
    }
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
