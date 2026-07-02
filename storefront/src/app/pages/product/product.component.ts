import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { PRODUCT_DETAIL } from '../../core/graphql/operations.graphql';
import { withImagePreset } from '../../core/utils/asset.util';
import { ApolloService } from '../../core/services/apollo.service';
import { CurrencyService } from '../../core/services/currency.service';
import { SeoService } from '../../core/services/seo.service';
import { StorefrontStateService } from '../../core/services/storefront-state.service';
import { buildWhatsAppLink, productEnquiryMessage } from '../../core/utils/whatsapp.util';

interface VariantVM {
  id: string;
  name: string;
  sku: string;
  priceMinor: number;
  currencyCode: string;
  inStock: boolean;
}

const JSONLD_ID = 'ld-product';

@Component({
  selector: 'app-product',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="flex justify-center py-16">
        <span class="loading loading-spinner loading-md text-primary"></span>
      </div>
    } @else if (!name()) {
      <p class="py-16 text-center text-base-content/60">Product not found.</p>
    } @else {
      <article class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <div class="aspect-square w-full overflow-hidden rounded-box border border-base-300 bg-base-200">
            @if (mainImage()) {
              <img [src]="withPreset(mainImage()!, 'large')" [alt]="name()" class="h-full w-full object-cover" />
            } @else {
              <div class="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-base-200 to-base-300 text-base-content/25">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
                </svg>
                <span class="text-xs font-medium uppercase tracking-wide">No image</span>
              </div>
            }
          </div>
          @if (images().length > 1) {
            <div class="flex gap-2 overflow-x-auto">
              @for (img of images(); track img) {
                <button
                  type="button"
                  class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-field border"
                  [class.border-primary]="img === mainImage()"
                  [class.border-base-300]="img !== mainImage()"
                  (click)="mainImage.set(img)"
                >
                  <img [src]="withPreset(img, 'thumb')" [alt]="name()" class="h-full w-full object-cover" />
                </button>
              }
            </div>
          }
        </div>

        <div class="flex flex-col gap-4">
          <h1 class="text-2xl font-bold">{{ name() }}</h1>

          @if (selected(); as v) {
            <div class="flex items-center gap-3">
              <span class="text-2xl font-bold text-primary">
                {{ currency.format(v.priceMinor, v.currencyCode) }}
              </span>
              @if (v.inStock) {
                <span class="badge badge-success badge-outline">In stock</span>
              } @else {
                <span class="badge badge-neutral">Out of stock</span>
              }
            </div>
          }

          @if (variants().length > 1) {
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium text-base-content/70">Options</span>
              <div class="flex flex-wrap gap-2">
                @for (v of variants(); track v.id) {
                  <button
                    type="button"
                    class="btn btn-sm"
                    [class.btn-primary]="v.id === selectedId()"
                    [class.btn-outline]="v.id !== selectedId()"
                    (click)="selectedId.set(v.id)"
                  >{{ v.name }}</button>
                }
              </div>
            </div>
          }

          @if (whatsappHref(); as href) {
            <a [href]="href" target="_blank" rel="noopener" class="btn btn-primary btn-block gap-2">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.599 5.393l-.999 3.648 3.9-1.34z" />
              </svg>
              Order on WhatsApp
            </a>
          } @else {
            <p class="text-sm text-base-content/60">Contact the store to order this item.</p>
          }

          @if (description()) {
            <div class="prose prose-sm max-w-none text-base-content/80" [innerHTML]="description()"></div>
          }
        </div>
      </article>
    }
  `,
})
export class ProductComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly apollo = inject(ApolloService);
  readonly currency = inject(CurrencyService);
  private readonly seo = inject(SeoService);
  private readonly state = inject(StorefrontStateService);

  readonly name = signal('');
  readonly description = signal('');
  readonly images = signal<string[]>([]);
  readonly mainImage = signal<string | null>(null);
  readonly variants = signal<VariantVM[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly pageUrl = signal('');

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.variants().find(v => v.id === id) ?? this.variants()[0] ?? null;
  });

  readonly whatsappHref = computed(() => {
    const store = this.state.store();
    const v = this.selected();
    if (!store?.whatsappNumber || !v) return null;
    const price = this.currency.format(v.priceMinor, v.currencyCode);
    const label = this.variants().length > 1 ? `${this.name()} (${v.name})` : this.name();
    return buildWhatsAppLink(
      store.whatsappNumber,
      productEnquiryMessage(store.name, label, price, this.pageUrl())
    );
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(pm => {
      const slug = pm.get('slug');
      if (slug) void this.load(slug);
    });
  }

  ngOnDestroy(): void {
    this.seo.clearJsonLd(JSONLD_ID);
  }

  withPreset(url: string, preset: 'thumb' | 'large'): string {
    return withImagePreset(url, preset);
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.pageUrl.set(
      typeof window !== 'undefined' ? `${window.location.origin}/products/${slug}` : ''
    );
    await this.state.resolve();
    try {
      const res = await this.apollo.getClient().query({
        query: PRODUCT_DETAIL,
        variables: { slug },
        fetchPolicy: 'cache-first',
      });
      const p = res.data?.product;
      if (!p) {
        this.name.set('');
        this.seo.setPage({ title: 'Product not found', noindex: true });
        return;
      }

      const imgs = [p.featuredAsset?.preview, ...p.assets.map(a => a.preview)].filter(
        (x): x is string => !!x
      );
      const uniqueImgs = [...new Set(imgs)];
      this.name.set(p.name);
      this.description.set(p.description ?? '');
      this.images.set(uniqueImgs);
      this.mainImage.set(uniqueImgs[0] ?? null);
      this.variants.set(
        p.variants.map(v => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          priceMinor: v.priceWithTax,
          currencyCode: v.currencyCode,
          inStock:
            (v.stockLevel ?? '').toUpperCase() !== 'OUT_OF_STOCK' && v.stockLevel !== '0',
        }))
      );
      this.selectedId.set(p.variants[0]?.id ?? null);

      this.applySeo(slug, p.name, p.description ?? '', uniqueImgs);
    } finally {
      this.loading.set(false);
    }
  }

  private applySeo(slug: string, productName: string, descriptionHtml: string, images: string[]): void {
    const store = this.state.store();
    const plain = this.stripHtml(descriptionHtml);
    const v = this.selected();
    this.seo.setPage({
      title: store ? `${productName} · ${store.name}` : productName,
      description: plain.slice(0, 160),
      image: images[0] ?? store?.logoUrl ?? null,
      canonicalPath: `/products/${slug}`,
    });
    this.seo.setJsonLd(JSONLD_ID, {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: productName,
      description: plain,
      image: images,
      ...(v
        ? {
            offers: {
              '@type': 'Offer',
              price: (v.priceMinor / 100).toFixed(2),
              priceCurrency: v.currencyCode,
              availability: v.inStock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            },
          }
        : {}),
    });
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
