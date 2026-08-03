import { inject, Injectable } from '@angular/core';
import { CustomerSearchService, CUSTOMER_CACHE_STALE_MS } from '@dukarun/customer';
import { OrderCacheService } from '@dukarun/order';
import { ProductCacheService } from '@dukarun/product';
import { SupplierSearchService } from '@dukarun/supplier';
import {
  type CachedPreviewPayload,
  type LinkPreviewDataProvider,
} from '../../shared/services/link-preview/link-preview-data-provider.token';
import { LinkPreviewPayloadService } from '../../shared/services/link-preview/link-preview-payload.service';

/**
 * Shell implementation that reads from entity caches (customer, order, product, supplier).
 * Registered via `LINK_PREVIEW_DATA_PROVIDER` so shared/pages code stays domain-agnostic.
 */
@Injectable({
  providedIn: 'root',
})
export class LinkPreviewDataProviderService implements LinkPreviewDataProvider {
  private readonly customerSearch = inject(CustomerSearchService);
  private readonly supplierSearch = inject(SupplierSearchService);
  private readonly orderCache = inject(OrderCacheService);
  private readonly productCache = inject(ProductCacheService);
  private readonly payloadService = inject(LinkPreviewPayloadService);

  getCachedPreviewData(key: string, id: string): CachedPreviewPayload | null {
    switch (key) {
      case 'customer': {
        const entry = this.customerSearch.getCustomerById(id);
        if (!entry) return null;
        const data = this.payloadService.buildCustomerPayload(entry.customer, entry.creditSummary);
        const stale = Date.now() - entry.updatedAt > CUSTOMER_CACHE_STALE_MS;
        return { data, stale };
      }
      case 'supplier': {
        const entry = this.supplierSearch.getSupplierById(id);
        if (!entry) return null;
        const data = this.payloadService.buildSupplierPayload(entry.supplier);
        return { data };
      }
      case 'order': {
        const entry = this.orderCache.getOrderById(id);
        if (!entry) return null;
        const data = this.payloadService.buildOrderPayload(entry.order);
        return { data };
      }
      case 'product': {
        const product = this.productCache.getProductById(id);
        if (!product) return null;
        const data = this.payloadService.buildProductPayload(product);
        return { data };
      }
      default:
        return null;
    }
  }
}
