import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { calculateProductStats } from '../../../core/services/stats/product-stats.util';
import {
  DeleteConfirmationData,
  DeleteConfirmationModalComponent,
} from '../../components/shared/delete-confirmation-modal.component';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { ProductAction, ProductCardComponent } from './components/product-card.component';
import { ProductSearchBarComponent } from './components/product-search-bar.component';
import { ProductStats, ProductStatsComponent } from './components/product-stats.component';
import { ProductTableRowComponent } from './components/product-table-row.component';

/**
 * Products list page - refactored with composable components
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 * - KISS principles applied
 */
@Component({
  selector: 'app-products',
  imports: [
    CommonModule,
    RouterLink,
    ProductCardComponent,
    ProductStatsComponent,
    ProductSearchBarComponent,
    ProductTableRowComponent,
    PaginationComponent,
    DeleteConfirmationModalComponent,
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // View references
  readonly deleteModal = viewChild<DeleteConfirmationModalComponent>('deleteModal');

  // State from service
  readonly products = this.productService.products;
  readonly isLoading = this.productService.isLoading;
  readonly error = this.productService.error;
  readonly totalItems = this.productService.totalItems;

  // Local UI state
  readonly searchQuery = signal('');
  readonly showLowStockOnly = signal(false);
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly deleteModalData = signal<DeleteConfirmationData>({
    entityName: '',
    relatedCount: 0,
    relatedLabel: 'variant',
  });
  readonly productToDelete = signal<string | null>(null);

  // Computed: filtered products
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const lowStockOnly = this.showLowStockOnly();
    let allProducts = this.products();

    // Apply low stock filter first
    if (lowStockOnly) {
      allProducts = allProducts.filter((product) =>
        product.variants?.some((v: any) => (v.stockOnHand || 0) < 10),
      );
    }

    // Apply search query filter
    if (!query) return allProducts;

    return allProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.variants?.some((v: any) => v.sku.toLowerCase().includes(query)),
    );
  });

  // Computed: paginated products
  readonly paginatedProducts = computed(() => {
    const filtered = this.filteredProducts();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredProducts();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics - using utility for single source of truth
  readonly stats = computed((): ProductStats => {
    return calculateProductStats(this.products());
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredProducts().length);
  });

  ngOnInit(): void {
    // Check for query params (e.g., ?lowStock=true)
    this.route.queryParams.subscribe((params) => {
      const lowStockParam = params['lowStock'] === 'true';
      if (lowStockParam !== this.showLowStockOnly()) {
        this.showLowStockOnly.set(lowStockParam);
        this.currentPage.set(1); // Reset to first page when filter changes
      }
    });

    this.loadProducts();
  }

  async loadProducts(): Promise<void> {
    await this.productService.fetchProducts({
      take: 100,
      skip: 0,
    });
  }

  async refreshProducts(): Promise<void> {
    await this.loadProducts();
  }

  /**
   * Handle product actions (view, edit, purchase, delete)
   */
  onProductAction(event: { action: ProductAction; productId: string }): void {
    const { action, productId } = event;

    switch (action) {
      case 'view':
        // Navigate to product detail view (to be implemented)
        console.log('View product:', productId);
        break;

      case 'edit':
        this.router.navigate(['/dashboard/products/edit', productId]);
        break;

      case 'purchase':
        // Navigate to purchases page with prepopulated variant
        const product = this.products().find((p) => p.id === productId);
        if (product?.variants && product.variants.length > 0) {
          // Use first variant for prepopulation
          const variantId = product.variants[0].id;
          this.router.navigate(['/dashboard/purchases'], {
            queryParams: { variantId },
          });
        }
        break;

      case 'delete':
        this.confirmDeleteProduct(productId);
        break;
    }
  }

  /**
   * Show delete confirmation modal
   */
  confirmDeleteProduct(productId: string): void {
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;

    this.productToDelete.set(productId);
    this.deleteModalData.set({
      entityName: product.name,
      relatedCount: product.variants?.length || 0,
      relatedLabel: 'variant',
      warningDetails: [
        'All associated stock data',
        'Sales history references',
      ],
    });

    // Show modal
    const modal = this.deleteModal();
    if (modal) {
      modal.show();
    }
  }

  /**
   * Handle delete confirmation
   */
  async onDeleteConfirmed(): Promise<void> {
    const productId = this.productToDelete();
    if (!productId) return;

    // Hide modal
    const modal = this.deleteModal();
    if (modal) {
      modal.hide();
    }

    // Delete the product
    const success = await this.productService.deleteProduct(productId);

    if (success) {
      // Clear state
      this.productToDelete.set(null);

      // Refresh the product list
      await this.refreshProducts();
    }
  }

  /**
   * Handle delete cancellation
   */
  onDeleteCancelled(): void {
    const modal = this.deleteModal();
    if (modal) {
      modal.hide();
    }
    this.productToDelete.set(null);
  }

  /**
   * Go to specific page
   */
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  /**
   * Change items per page
   */
  changeItemsPerPage(items: number): void {
    this.itemsPerPage.set(items);
    this.currentPage.set(1); // Reset to first page
  }

  /**
   * Toggle low stock filter and sync with query params
   */
  toggleLowStockFilter(enabled: boolean): void {
    this.showLowStockOnly.set(enabled);
    this.currentPage.set(1); // Reset to first page when filter changes

    // Update query params without navigation
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: enabled ? { lowStock: 'true' } : {},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.productService.clearError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackByProductId(index: number, product: any): string {
    return product.id;
  }

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
