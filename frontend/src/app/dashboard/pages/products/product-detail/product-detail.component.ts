import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { AuthService } from '../../../../core/services/auth.service';
import { EntityDetailLayoutComponent } from '../../../components/shared/entity-detail-layout.component';
import { ProductLabelComponent } from '../../shared/components/product-label.component';
import { StatusBadgeComponent } from '../../../components/shared/status-badge.component';

/**
 * Product Detail Page — full-page view for a single product.
 *
 * Fetches the product by route param `:id` and displays all product
 * information including variants in a well-structured layout.
 * Uses `EntityDetailLayoutComponent` as the standard detail shell.
 */
@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [EntityDetailLayoutComponent, ProductLabelComponent, StatusBadgeComponent],
  templateUrl: './product-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly authService = inject(AuthService);
  readonly currencyService = inject(CurrencyService);

  // State
  readonly product = signal<any>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | undefined>(undefined);

  readonly canEdit = this.authService.hasUpdateProductPermission;

  // Derived
  readonly title = computed(() => this.product()?.name ?? 'Product');
  readonly subtitle = computed(() => {
    const p = this.product();
    if (!p) return undefined;
    const variantCount = p.variants?.length ?? 0;
    return `${variantCount} variant${variantCount !== 1 ? 's' : ''}`;
  });

  readonly variants = computed(() => this.product()?.variants ?? []);

  readonly isService = computed(() => this.variants().some((v: any) => v.trackInventory === false));

  readonly totalStock = computed(() =>
    this.variants().reduce((sum: number, v: any) => sum + (v.stockOnHand ?? 0), 0),
  );

  readonly priceRange = computed(() => {
    const vs = this.variants();
    if (vs.length === 0) return 'N/A';
    const prices = vs.map((v: any) => v.priceWithTax);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return this.currencyService.format(min, false);
    return `${this.currencyService.format(min, false)} – ${this.currencyService.format(max, false)}`;
  });

  readonly barcode = computed(() => this.product()?.customFields?.barcode ?? null);

  readonly facetValues = computed(() => {
    const fvs = this.product()?.facetValues ?? [];
    return fvs.map((fv: any) => ({
      name: fv.name,
      facet: fv.facet,
    }));
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('No product ID provided');
      this.isLoading.set(false);
      return;
    }
    await this.loadProduct(id);
  }

  private async loadProduct(id: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);
    try {
      const product = await this.productService.getProductById(id);
      if (!product) {
        this.error.set('Product not found');
      } else {
        this.product.set(product);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Failed to load product');
    } finally {
      this.isLoading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard/products']);
  }

  onEdit(): void {
    const id = this.product()?.id;
    if (id) {
      this.router.navigate(['/dashboard/products/edit', id]);
    }
  }

  onPurchase(): void {
    const id = this.product()?.id;
    if (id) {
      this.router.navigate(['/dashboard/purchases/create'], {
        queryParams: { productId: id },
      });
    }
  }

  getStockDisplay(variant: any): string {
    if (variant.trackInventory === false) return '∞';
    return String(variant.stockOnHand ?? 0);
  }

  getStockBadgeType(variant: any): string {
    if (variant.trackInventory === false) return 'info';
    const stock = variant.stockOnHand ?? 0;
    if (stock > 20) return 'success';
    if (stock > 0) return 'warning';
    return 'error';
  }

  getThumbnail(): string | null {
    return this.product()?.featuredAsset?.preview ?? null;
  }
}
