import { inject, Injectable } from '@angular/core';
import { CHECK_BARCODE_EXISTS, CHECK_SKU_EXISTS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { VariantInput } from '../product.service';
import { isBarcodeIgnored } from './barcode.util';

/**
 * Product Validation Service
 *
 * Handles validation logic for products and variants.
 * Includes SKU validation and input validation.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductValidationService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Check if a SKU already exists
   * Returns true if SKU exists, false otherwise
   */
  async checkSKUExists(sku: string): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: CHECK_SKU_EXISTS,
        variables: { sku },
        fetchPolicy: 'network-only',
      });

      return (result.data?.productVariants?.items?.length ?? 0) > 0;
    } catch (error) {
      console.error('SKU check failed:', error);
      return false;
    }
  }

  /**
   * Check if a barcode already exists
   * @param barcode - The barcode to check
   * @param excludeProductId - Optional product ID to exclude from check (for updates)
   * @returns Object with exists flag and product info if found
   */
  async checkBarcodeExists(
    barcode: string,
    excludeProductId?: string,
  ): Promise<{ exists: boolean; productId?: string; productName?: string }> {
    if (isBarcodeIgnored(barcode)) {
      return { exists: false };
    }

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: CHECK_BARCODE_EXISTS as any,
        variables: { barcode: barcode.trim() },
        fetchPolicy: 'network-only',
      });

      const items = result.data?.products?.items ?? [];
      if (items.length === 0) {
        return { exists: false };
      }

      // If excludeProductId is provided, check if the found product is different
      const foundProduct = items[0];
      if (excludeProductId && foundProduct.id === excludeProductId) {
        return { exists: false };
      }

      return {
        exists: true,
        productId: foundProduct.id,
        productName: foundProduct.name,
      };
    } catch (error) {
      console.error('Barcode check failed:', error);
      // On error, assume it doesn't exist to avoid blocking valid operations
      return { exists: false };
    }
  }

  /**
   * Validate product and variants before creation
   * @param variants - Array of variants to validate
   * @returns Object with isValid flag and optional error message
   */
  async validateProductInput(
    variants: VariantInput[],
  ): Promise<{ isValid: boolean; error?: string }> {
    // Step 1: Validate all SKUs are unique
    const skuSet = new Set(variants.map((v) => v.sku));
    if (skuSet.size !== variants.length) {
      return {
        isValid: false,
        error: 'Duplicate SKUs detected. Each variant must have a unique SKU.',
      };
    }

    // Step 2: Validate all variant prices
    const invalidPrices = variants
      .map((v, i) => ({ index: i, price: v.price, sku: v.sku }))
      .filter((v) => v.price === null || v.price === undefined || isNaN(v.price) || v.price <= 0);

    if (invalidPrices.length > 0) {
      const invalidDetails = invalidPrices
        .map((v) => `Variant ${v.index + 1} (${v.sku}): ${v.price}`)
        .join(', ');
      return {
        isValid: false,
        error: `Invalid prices detected: ${invalidDetails}. All prices must be positive numbers.`,
      };
    }

    // Step 3: Check if any SKUs already exist in the system
    const skuChecks = await Promise.all(variants.map((v) => this.checkSKUExists(v.sku)));
    const existingSKUs = variants.filter((_, i) => skuChecks[i]).map((v) => v.sku);

    if (existingSKUs.length > 0) {
      return {
        isValid: false,
        error: `The following SKUs already exist: ${existingSKUs.join(', ')}`,
      };
    }

    return { isValid: true };
  }
}
