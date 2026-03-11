import { Injectable } from '@angular/core';
import { LinkPreviewRegistryService } from './link-preview-registry.service';

/**
 * Registers hover preview loaders for dashboard detail pages.
 * Called once when dashboard loads so that the host can resolve key → component.
 */
@Injectable({
  providedIn: 'root',
})
export class RegisterLinkPreviewsService {
  constructor(private readonly registry: LinkPreviewRegistryService) {
    this.registry.register('customer', () =>
      import('../../../dashboard/pages/customers/customer-detail/customer-detail-preview.component').then(
        (m) => m.CustomerDetailPreviewComponent,
      ),
    );
    this.registry.register('order', () =>
      import('../../../dashboard/pages/orders/order-detail/order-detail-preview.component').then(
        (m) => m.OrderDetailPreviewComponent,
      ),
    );
    this.registry.register('product', () =>
      import('../../../dashboard/pages/products/product-detail/product-detail-preview.component').then(
        (m) => m.ProductDetailPreviewComponent,
      ),
    );
    this.registry.register('supplier', () =>
      import('../../../dashboard/pages/suppliers/supplier-detail/supplier-detail-preview.component').then(
        (m) => m.SupplierDetailPreviewComponent,
      ),
    );
  }
}
