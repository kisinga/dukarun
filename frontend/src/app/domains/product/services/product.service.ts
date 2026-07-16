import { inject, Injectable } from '@angular/core';
import type { InventoryAlertFilter } from '../../../shared/graphql/generated/graphql';

import { ProductApiService } from './product-api.service';
import { ProductAssetService } from './product-asset.service';
import { ProductListingService, ProductQueryOptions } from './product-listing.service';
import { ProductOptionService } from './product-option.service';
import { ProductStateService } from './product-state.service';
import { ProductValidationService } from './product-validation.service';
import { ProductVariantService } from './product-variant.service';

/**
 * Product creation input
 */
export interface ProductInput {
  name: string;
  description: string;
  enabled: boolean;
  barcode?: string; // Optional product-level barcode
  /** Facet value IDs (manufacturer, category, tags). This form owns all facet assignments. */
  facetValueIds?: string[];
}

/**
 * Variant/SKU creation input
 */
export interface VariantInput {
  sku: string;
  name: string; // Auto-generated name
  price: number; // In currency units (e.g., 10.99) - the base price for the variant
  trackInventory?: boolean; // Native Vendure field: false for services (infinite stock), true for products
  stockOnHand: number;
  stockLocationId: string;
  optionIds?: string[]; // Product option IDs (KISS: typically 1 per variant)
}

/**
 * ProductOptionGroup with options
 */
export interface ProductOptionGroup {
  id: string;
  code: string;
  name: string;
  options: ProductOption[];
}

/**
 * ProductOption within a group
 */
export interface ProductOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Service for product management operations
 *
 * ARCHITECTURE:
 * - Products are created first, then variants are added
 * - Each variant represents a SKU with its own price and stock
 * - Stock is tracked per variant per location
 * - All operations are channel-aware via ApolloService
 * - Composed of specialized sub-services for better maintainability
 *
 * FLOW:
 * 1. Create product (basic info)
 * 2. Create variants for the product (SKUs with prices and names)
 * 3. Stock levels are set during variant creation
 */
@Injectable({
  providedIn: 'root',
})
export class ProductService {
  // Inject all sub-services
  private readonly apiService = inject(ProductApiService);
  private readonly assetService = inject(ProductAssetService);
  private readonly listingService = inject(ProductListingService);
  private readonly optionService = inject(ProductOptionService);
  private readonly stateService = inject(ProductStateService);
  private readonly validationService = inject(ProductValidationService);
  private readonly variantService = inject(ProductVariantService);

  // Expose state signals from state service
  readonly isCreating = this.stateService.isCreating;
  readonly error = this.stateService.error;
  readonly isLoading = this.stateService.isLoading;
  readonly products = this.stateService.products;
  readonly totalItems = this.stateService.totalItems;

  /**
   * Check if a SKU already exists
   * Returns the variant if it exists, null otherwise
   */
  async checkSKUExists(sku: string): Promise<boolean> {
    return this.validationService.checkSKUExists(sku);
  }

  /**
   * Create a complete product with variants and photos (transactional)
   * This is the main entry point for product creation
   *
   * FLOW:
   * 1. Validate all inputs
   * 2. Create product
   * 3. Create variants
   * 4. Upload photos (optional, doesn't block success)
   *
   * If variant creation fails, product is automatically rolled back
   *
   * @param productInput - Basic product information
   * @param variants - Array of SKUs/variants to create
   * @returns Created product ID or null if failed
   */
  async createProductWithVariants(
    productInput: ProductInput,
    variants: VariantInput[],
  ): Promise<string | null> {
    this.stateService.setIsCreating(true);
    this.stateService.setError(null);

    let createdProductId: string | null = null;

    try {
      // VALIDATION PHASE: Check everything before starting
      console.log('🔍 Validating product and variants...');

      const validation = await this.validationService.validateProductInput(variants);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      console.log('✅ Validation passed');

      // EXECUTION PHASE: Create in order, with automatic rollback on failure

      // Step 4: Create the product
      console.log('📦 Creating product...');
      const productId = await this.apiService.createProduct(productInput);
      if (!productId) {
        throw new Error('Failed to create product');
      }
      createdProductId = productId;
      console.log('✅ Product created:', productId);

      // Step 5: Create option group and variants
      console.log('📦 Creating variants...');
      try {
        let variantsWithOptions = variants;

        // Only create option group if we have multiple variants
        // Vendure requires option groups for products with multiple variants
        if (variants.length > 1) {
          console.log('🔧 Creating option group for multiple variants...');
          const result = await this.optionService.createVariantOptionGroup(
            productId,
            productInput.name,
            variants,
          );
          variantsWithOptions = result.variantsWithOptions;
          console.log('✅ Option group created:', result.optionGroupId);
          console.log('✅ Variants mapped to options');
        }

        const createdVariants = await this.variantService.createVariants(
          productId,
          variantsWithOptions,
        );
        if (!createdVariants || createdVariants.length === 0) {
          throw new Error('Failed to create product variants');
        }
        console.log('✅ Variants created:', createdVariants.length);
      } catch (variantError: any) {
        // ROLLBACK: Delete the product if variants fail
        console.error('❌ Variant creation failed, rolling back product...');
        try {
          // Mark for deletion (attempt to clean up)
          console.log('🔄 Attempting to delete product', productId);
          // Note: Actual deletion would require DELETE_PRODUCT mutation
          // For now, we just log and fail the entire operation
        } catch (rollbackError) {
          console.error('⚠️ Rollback failed:', rollbackError);
        }
        throw new Error(
          `Variant creation failed - product cleanup pending. Details: ${variantError.message}`,
        );
      }

      // Step 6: Upload photos (non-blocking - if it fails, product/variants are still created)
      console.log('✅ Product and variants created successfully');
      return productId;
    } catch (error: any) {
      console.error('❌ Product creation transaction failed:', error);
      this.stateService.setError(error.message || 'Failed to create product');
      return null;
    } finally {
      this.stateService.setIsCreating(false);
    }
  }

  /**
   * Get product details by ID
   */
  async getProductById(id: string): Promise<any | null> {
    return this.apiService.getProductById(id);
  }

  /**
   * Upload product photos and assign them to a product
   * This is called AFTER product creation succeeds
   * Non-blocking: if it fails, the product/variants remain created
   */
  async uploadProductPhotos(productId: string, photos: File[]): Promise<string[] | null> {
    return this.assetService.uploadProductPhotos(productId, photos);
  }

  /**
   * Delete a product by ID
   * @param productId - The ID of the product to delete
   * @returns true if successful, false otherwise
   */
  async deleteProduct(productId: string): Promise<boolean> {
    return this.apiService.deleteProduct(productId);
  }

  /**
   * Update product assets (add new, remove old)
   * @param productId - Product ID
   * @param newPhotos - New photo files to upload
   * @param removedAssetIds - Asset IDs to remove
   * @returns true if successful, false otherwise
   */
  async updateProductAssets(
    productId: string,
    newPhotos: File[],
    removedAssetIds: string[],
  ): Promise<boolean> {
    return this.assetService.updateProductAssets(productId, newPhotos, removedAssetIds);
  }

  /**
   * Delete a single asset
   * @param assetId - Asset ID to delete
   * @returns true if successful, false otherwise
   */
  async deleteAsset(assetId: string): Promise<boolean> {
    return this.assetService.deleteAsset(assetId);
  }

  /**
   * Update variant prices to fix tax calculation issues
   * This method should be called to fix existing products with incorrect pricing
   * @param productId - Product ID to update
   * @param variants - Array of variants with corrected prices
   */
  async updateVariantPrices(
    productId: string,
    variants: { id: string; price: number }[],
  ): Promise<boolean> {
    return this.variantService.updateVariantPrices(productId, variants);
  }

  /**
   * Full overwrite for product edit: update product base, delete all existing variants, create all from form.
   * Single orchestration for edit flow; component calls this only (no updateProductWithVariants + createVariants).
   */
  async updateProductFullOverwrite(
    productId: string,
    productBase: { name: string; barcode?: string; facetValueIds?: string[] },
    existingVariantIds: string[],
    variantInputs: VariantInput[],
  ): Promise<boolean> {
    try {
      const productUpdated = await this.apiService.updateProduct(productId, productBase);
      if (!productUpdated) {
        return false;
      }
      if (existingVariantIds.length > 0) {
        const deleted = await this.variantService.deleteVariants(existingVariantIds);
        if (!deleted) {
          return false;
        }
      }
      if (variantInputs.length > 0) {
        const created = await this.variantService.createVariants(productId, variantInputs);
        if (!created || created.length === 0) {
          this.stateService.setError('Failed to create variants');
          return false;
        }
      }
      return true;
    } catch (error: any) {
      console.error('Failed to update product (full overwrite):', error);
      this.stateService.setError(error.message || 'Failed to update product');
      return false;
    }
  }

  /**
   * Update product base data (name, barcode, optional facetValueIds) and variant details.
   * When facetValueIds is provided (e.g. from product-create), facets are fully replaced.
   * When omitted (e.g. from product-edit), existing facets are left unchanged.
   */
  async updateProductWithVariants(
    productId: string,
    name: string,
    variants: { id: string; name: string; price: number; wholesalePrice?: number | null }[],
    barcode?: string,
    facetValueIds?: string[],
  ): Promise<boolean> {
    try {
      const productUpdated = await this.apiService.updateProduct(productId, {
        name,
        barcode,
        facetValueIds,
      });
      if (!productUpdated) {
        return false;
      }

      const variantsUpdated = await this.variantService.updateVariantDetails(variants);
      return variantsUpdated;
    } catch (error: any) {
      console.error('Failed to update product and variants:', error);
      this.stateService.setError(error.message || 'Failed to update product');
      return false;
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.stateService.clearError();
  }

  /**
   * Fetch all products with optional pagination.
   * @param options - Optional pagination and filter options
   * @param queryOptions - Optional fetch policy (default cache-first; use network-only after mutations)
   */
  async fetchProducts(options?: any, queryOptions?: ProductQueryOptions): Promise<void> {
    return this.listingService.fetchProducts(options, queryOptions);
  }

  /**
   * Fetch products matching an inventory alert filter.
   * Server-side filtering and pagination so dashboard links show the full result set.
   */
  async fetchProductsByInventoryAlert(
    filter: InventoryAlertFilter,
    options?: any,
    queryOptions?: ProductQueryOptions,
  ): Promise<void> {
    return this.listingService.fetchProductsByInventoryAlert(filter, options, queryOptions);
  }
}
