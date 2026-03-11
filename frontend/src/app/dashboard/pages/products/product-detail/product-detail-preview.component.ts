import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { ProductSearchService } from '../../../../core/services/product/product-search.service';
import { ProductCacheService } from '../../../../core/services/product/product-cache.service';
import { LinkPreviewDataProviderService } from '../../../../core/services/link-preview/link-preview-data-provider.service';

/**
 * Compact hover preview for product detail page.
 * Cache-first: uses ProductCacheService; on miss fetches via ProductSearchService and hydrates cache.
 */
@Component({
  selector: 'app-product-detail-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="text-sm space-y-2 animate-pulse">
        <div class="skeleton h-4 w-3/4"></div>
        <div class="skeleton h-3 w-1/2"></div>
        <div class="skeleton h-3 w-full"></div>
      </div>
    } @else {
      <div class="text-sm space-y-1">
        <div class="font-semibold text-base-content truncate">{{ name() }}</div>
        @if (line2()) {
          <div class="text-base-content/70 text-xs">{{ line2() }}</div>
        }
        <div class="text-base-content/60 text-xs">{{ line3() }}</div>
      </div>
    }
  `,
})
export class ProductDetailPreviewComponent implements OnInit {
  readonly entityId = input.required<string>();
  readonly entityKey = input<string>();

  private readonly productSearchService = inject(ProductSearchService);
  private readonly productCacheService = inject(ProductCacheService);
  private readonly dataProvider = inject(LinkPreviewDataProviderService);

  readonly loading = signal(true);
  readonly name = signal<string>('Product');
  readonly line2 = signal<string | null>(null);
  readonly line3 = signal<string>('…');

  ngOnInit(): void {
    this.load(this.entityId());
  }

  private async load(id: string): Promise<void> {
    const key = this.entityKey() ?? 'product';
    const cached = this.dataProvider.getCachedPreviewData(key, id);
    if (cached) {
      this.name.set(cached.data.line1);
      this.line2.set(cached.data.line2 ?? null);
      this.line3.set(cached.data.line3 ?? '—');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const product = await this.productSearchService.getProductById(id);
      if (!product) {
        this.name.set('Product');
        this.line3.set('Not found');
        this.loading.set(false);
        return;
      }
      this.productCacheService.hydrateProduct(product);
      const data = this.dataProvider.getCachedPreviewData(key, id);
      if (data) {
        this.name.set(data.data.line1);
        this.line2.set(data.data.line2 ?? null);
        this.line3.set(data.data.line3 ?? '—');
      }
    } catch {
      this.name.set('Error');
      this.line3.set('Could not load');
    } finally {
      this.loading.set(false);
    }
  }
}
