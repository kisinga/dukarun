import { inject, Injectable } from '@angular/core';
import {
  CustomerSearchService,
  CUSTOMER_CACHE_STALE_MS,
} from '../customer/customer-search.service';
import { SupplierSearchService } from '../supplier/supplier-search.service';
import { OrderCacheService } from '../order-cache.service';
import { ProductCacheService } from '../product/product-cache.service';
import { LinkPreviewPayloadService } from './link-preview-payload.service';
import type { LinkPreviewData } from './link-preview.types';

export interface CachedPreviewPayload {
  data: LinkPreviewData;
  stale?: boolean;
}

/**
 * Provides cached preview data for link hover previews.
 * Reads from entity caches (customer, order, product, supplier); returns null on cache miss.
 * For customer, includes stale flag when cache entry is older than CUSTOMER_CACHE_STALE_MS.
 */
@Injectable({
  providedIn: 'root',
})
export class LinkPreviewDataProviderService {
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
