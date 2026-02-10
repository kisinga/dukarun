import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  buildProductListOptions,
  type ProductListFilterState,
} from '../../../core/services/product/product-list-filter.model';
import { FacetService } from '../../../core/services/product/facet.service';
import { FACET_CODES, type FacetCode } from '../../../core/services/product/facet.types';
import { ProductService } from '../../../core/services/product.service';
import { calculateProductStats } from '../../../core/services/stats/product-stats.util';
import {
  DeleteConfirmationData,
  DeleteConfirmationModalComponent,
} from '../../components/shared/delete-confirmation-modal.component';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { ProductAction, ProductCardComponent } from './components/product-card.component';
import { ProductListFacetSelectorComponent } from './components/product-list-facet-selector.component';
import { ProductSearchBarComponent } from './components/product-search-bar.component';
import { ProductStats, ProductStatsComponent } from './components/product-stats.component';
import { ProductTableRowComponent } from './components/product-table-row.component';
import { VariantListComponent } from '../shared/components/variant-list.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

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
    ProductListFacetSelectorComponent,
    ProductStatsComponent,
    ProductSearchBarComponent,
    ProductTableRowComponent,
    VariantListComponent,
    PaginationComponent,
    DeleteConfirmationModalComponent,
    PageHeaderComponent,
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly facetService = inject(FacetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // View references
  readonly deleteModal = viewChild<DeleteConfirmationModalComponent>('deleteModal');

  // State from service
  readonly products = this.productService.products;
  readonly isLoading = this.productService.isLoading;
  readonly error = this.productService.error;
  readonly totalItems = this.productService.totalItems;

  // Local UI state: filters (server-side) + low stock (client-side on current page)
  readonly searchQuery = signal('');
  readonly selectedFacetValueIds = signal<Partial<Record<FacetCode, string[]>>>({});
  readonly enabledFilter = signal<'all' | 'active' | 'disabled'>('all');
  readonly sortBy = signal<'name_asc' | 'name_desc' | null>(null);
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
  /** Product IDs whose variant detail row is expanded. Seeded with products that have < 3 variants. */
  readonly expandedProductIds = signal<Set<string>>(new Set());

  // Build filter state from signals for buildProductListOptions
  private readonly filterState = computed(
    (): ProductListFilterState => ({
      searchTerm: this.searchQuery().trim() || undefined,
      facetValueIds: this.selectedFacetValueIds(),
      enabled: this.enabledFilter() === 'all' ? null : this.enabledFilter() === 'active',
      sort:
        this.sortBy() === 'name_asc'
          ? { name: 'ASC' }
          : this.sortBy() === 'name_desc'
            ? { name: 'DESC' }
            : undefined,
    }),
  );

  // Server returns current page; apply low-stock filter client-side only to that page
  readonly displayedProducts = computed(() => {
    const list = this.products();
    if (!this.showLowStockOnly()) return list;
    return list.filter((product) =>
      product.variants?.some((v: { stockOnHand?: number }) => (v.stockOnHand ?? 0) < 10),
    );
  });

  readonly totalPages = computed(() => {
    const total = this.totalItems();
    const perPage = this.itemsPerPage();
    return Math.ceil(total / perPage) || 1;
  });

  readonly stats = computed((): ProductStats => {
    return calculateProductStats(this.products());
  });

  readonly endItem = computed(() => {
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const total = this.totalItems();
    return Math.min(page * perPage, total);
  });

  constructor() {
    effect(() => {
      this.filterState();
      this.currentPage();
      this.itemsPerPage();
      this.loadProducts();
    });
    // Seed expandedProductIds so products with 2–3 variants start expanded (single variant = no expansion UI)
    effect(() => {
      const products = this.displayedProducts();
      this.expandedProductIds.update((prev) => {
        const next = new Set(prev);
        products.forEach((p) => {
          const n = p.variants?.length ?? 0;
          if (n > 1 && n <= 3) {
            next.add(p.id);
          }
        });
        return next;
      });
    });
  }

  isExpanded(productId: string): boolean {
    return this.expandedProductIds().has(productId);
  }

  toggleExpand(productId: string): void {
    this.expandedProductIds.update((set) => {
      const next = new Set(set);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const lowStockParam = params['lowStock'] === 'true';
      if (lowStockParam !== this.showLowStockOnly()) {
        this.showLowStockOnly.set(lowStockParam);
      }
    });
  }

  async loadProducts(): Promise<void> {
    const state = this.filterState();
    const perPage = this.itemsPerPage();
    const page = this.currentPage();
    const pagination = { take: perPage, skip: (page - 1) * perPage };
    let manufacturerIdsMatchingSearch: string[] = [];
    if (state.searchTerm?.trim()) {
      manufacturerIdsMatchingSearch = await this.facetService.getManufacturerIdsMatchingName(
        state.searchTerm.trim(),
      );
    }
    const options = buildProductListOptions(state, pagination, {
      manufacturerIdsMatchingSearch:
        manufacturerIdsMatchingSearch.length > 0 ? manufacturerIdsMatchingSearch : undefined,
    });
    await this.productService.fetchProducts(options);
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
        // Navigate to purchase create page with prepopulated variant
        const product = this.products().find((p) => p.id === productId);
        if (product?.variants && product.variants.length > 0) {
          // Use first variant for prepopulation
          const variantId = product.variants[0].id;
          this.router.navigate(['/dashboard/purchases/create'], {
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
      warningDetails: ['All associated stock data', 'Sales history references'],
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
    this.currentPage.set(1);
  }

  onSearchQueryChange(q: string): void {
    this.searchQuery.set(q);
    this.currentPage.set(1);
  }

  setFacetIds(code: FacetCode, ids: string[]): void {
    this.selectedFacetValueIds.update((m) => ({ ...m, [code]: ids }));
    this.currentPage.set(1);
  }

  setEnabledFilter(value: 'all' | 'active' | 'disabled'): void {
    this.enabledFilter.set(value);
    this.currentPage.set(1);
  }

  setSortBy(value: 'name_asc' | 'name_desc' | null): void {
    this.sortBy.set(value);
    this.currentPage.set(1);
  }

  clearAllFilters(): void {
    this.searchQuery.set('');
    this.selectedFacetValueIds.set({});
    this.enabledFilter.set('all');
    this.sortBy.set(null);
    this.currentPage.set(1);
  }

  /**
   * Toggle low stock filter and sync with query params
   */
  /**
   * Handle low stock filter click from stats component
   */
  onLowStockStatsClick(): void {
    this.toggleLowStockFilter(!this.showLowStockOnly());
  }

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

  readonly facetCodes = FACET_CODES;
}
