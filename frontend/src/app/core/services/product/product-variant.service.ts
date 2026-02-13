import { inject, Injectable } from '@angular/core';
import type {
  CreateProductVariantsMutation,
  CreateProductVariantsMutationVariables,
  UpdateProductVariantMutation,
  UpdateProductVariantMutationVariables,
} from '../../graphql/generated/graphql';
import {
  CREATE_PRODUCT_VARIANTS,
  DELETE_PRODUCT_VARIANTS,
  UPDATE_PRODUCT_VARIANT,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { VariantInput } from '../product.service';
import { ProductStateService } from './product-state.service';

/**
 * Product Variant Service
 *
 * Handles variant creation and update operations.
 * Manages variant-specific logic including pricing and stock.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductVariantService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(ProductStateService);

  /**
   * Create variants for a product (step 2)
   * Creates each variant sequentially to avoid Vendure's unique option constraint
   */
  async createVariants(productId: string, variants: VariantInput[]): Promise<any[] | null> {
    try {
      const client = this.apolloService.getClient();

      console.log('🔧 Creating variants for product:', productId);
      console.log('🔧 Variant inputs received:', variants);

      const createdVariants: any[] = [];

      // Create each variant sequentially to avoid Vendure's unique option constraint
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];

        // Validate price before proceeding
        if (v.price === null || v.price === undefined || isNaN(v.price) || v.price <= 0) {
          console.error(`❌ Invalid price for variant ${i + 1}:`, v.price);
          throw new Error(
            `Invalid price for variant ${i + 1}: ${v.price}. Price must be a positive number.`,
          );
        }

        // Convert boolean trackInventory to Vendure's GlobalFlag enum ("TRUE" or "FALSE")
        const trackInventoryValue =
          v.trackInventory !== undefined ? (v.trackInventory ? 'TRUE' : 'FALSE') : 'TRUE'; // Default to TRUE (track inventory)

        // Since prices include tax, use the price directly
        // Use prices array for proper multi-currency support
        const input: any = {
          productId,
          sku: v.sku,
          price: Math.round(v.price * 100), // Convert price to cents for GraphQL Money type
          prices: [
            {
              price: Math.round(v.price * 100), // Convert price to cents
              currencyCode: 'KES' as any, // Use channel currency
            },
          ],
          trackInventory: trackInventoryValue, // Use enum string value
          stockOnHand: v.stockOnHand,
          translations: [
            {
              languageCode: 'en' as any,
              name: v.name,
            },
          ],
        };

        // Only include stockLevels if we have a valid stockLocationId
        // For services (trackInventory: FALSE), stockLocationId may be empty
        if (v.stockLocationId && v.stockLocationId.trim() !== '') {
          input.stockLevels = [
            {
              stockLocationId: v.stockLocationId,
              stockOnHand: v.stockOnHand,
            },
          ];
        }

        // Include optionIds only if provided (for future Phase 1)
        if (v.optionIds && v.optionIds.length > 0) {
          input.optionIds = v.optionIds;
        }

        // Include customFields if provided (e.g., wholesalePrice, allowFractionalQuantity)
        // Check if customFields exists on the variant object (it's not in the VariantInput interface but is added dynamically)
        const variantWithCustomFields = v as any;
        if (variantWithCustomFields.customFields !== undefined) {
          input.customFields = variantWithCustomFields.customFields;
          console.log(`🔧 Including customFields for variant ${i + 1}:`, input.customFields);
        }

        console.log(`🔧 Creating variant ${i + 1}/${variants.length}:`, v.sku);
        console.log(`🔧 Variant input data:`, JSON.stringify(input, null, 2));

        const result = await client.mutate<
          CreateProductVariantsMutation,
          CreateProductVariantsMutationVariables
        >({
          mutation: CREATE_PRODUCT_VARIANTS,
          variables: { input: [input] }, // Send as single-item array
        });

        console.log(`🔧 Variant ${i + 1} result:`, result);

        // Check for errors in the result (GraphQL errors may be on result.errors; Apollo also has result.error)
        if (!result.data?.createProductVariants) {
          const gqlErrors = (result as { errors?: Array<{ message?: string }> }).errors;
          const msg = gqlErrors?.[0]?.message ?? `Mutation returned no data for variant ${i + 1}`;
          console.error(`❌ No variant returned for variant ${i + 1}:`, gqlErrors ?? result.error);
          throw new Error(msg);
        }

        const variantResult = result.data.createProductVariants[0];
        if (!variantResult) {
          throw new Error(`Variant ${i + 1} was not created`);
        }

        console.log(`🔧 Created variant details:`, {
          id: variantResult.id,
          sku: variantResult.sku,
          price: variantResult.price,
          priceWithTax: variantResult.priceWithTax,
        });

        createdVariants.push(variantResult);
        console.log(`✅ Variant ${i + 1} created:`, variantResult.sku);
      }

      console.log(`✅ All ${createdVariants.length} variants created successfully`);
      return createdVariants;
    } catch (error: any) {
      console.error('❌ Variant creation failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        graphQLErrors: error.graphQLErrors,
        networkError: error.networkError,
        extraInfo: error.extraInfo,
      });
      throw error;
    }
  }

  /**
   * Delete variants by ID. Used for full-overwrite product edit (delete then recreate).
   */
  async deleteVariants(variantIds: string[]): Promise<boolean> {
    if (variantIds.length === 0) return true;
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate<{
        deleteProductVariants: Array<{ result: string; message?: string | null }>;
      }>({
        mutation: DELETE_PRODUCT_VARIANTS as any,
        variables: { ids: variantIds },
      });
      if (result.error) {
        console.error('❌ deleteProductVariants failed:', result.error);
        this.stateService.setError(result.error.message ?? 'Failed to delete variants');
        return false;
      }
      const responses = result.data?.deleteProductVariants ?? [];
      const failed = responses.some((r) => r.result !== 'DELETED');
      if (failed) {
        console.error('❌ Some variants were not deleted:', responses);
        this.stateService.setError('Failed to delete one or more variants');
        return false;
      }
      return true;
    } catch (error: any) {
      console.error('❌ deleteVariants failed:', error);
      this.stateService.setError(error.message ?? 'Failed to delete variants');
      return false;
    }
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
    try {
      console.log('🔄 Updating variant prices for product:', productId);
      const client = this.apolloService.getClient();

      for (const variant of variants) {
        const result = await client.mutate<
          UpdateProductVariantMutation,
          UpdateProductVariantMutationVariables
        >({
          mutation: UPDATE_PRODUCT_VARIANT,
          variables: {
            input: {
              id: variant.id,
              price: Math.round(variant.price * 100), // Convert to cents
              prices: [
                {
                  price: Math.round(variant.price * 100), // Convert to cents
                  currencyCode: 'KES' as any, // Use channel currency
                },
              ],
            },
          },
        });

        if (result.error) {
          console.error(`❌ Failed to update variant ${variant.id}:`, result.error);
          return false;
        }

        console.log(`✅ Updated variant ${variant.id} price to: ${variant.price}`);
      }

      return true;
    } catch (error: any) {
      console.error('❌ Failed to update variant prices:', error);
      this.stateService.setError(error.message || 'Failed to update variant prices');
      return false;
    }
  }

  /**
   * Update variant details (name + price + wholesalePrice) for existing variants.
   * Used by the product edit flow.
   */
  async updateVariantDetails(
    variants: { id: string; name: string; price: number; wholesalePrice?: number | null }[],
  ): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      for (const variant of variants) {
        const priceInCents = Math.round(variant.price * 100);
        const input: any = {
          id: variant.id,
          price: priceInCents,
          prices: [
            {
              price: priceInCents,
              currencyCode: 'KES' as any,
            },
          ],
        };

        // Include customFields if wholesalePrice is provided
        if (variant.wholesalePrice !== undefined && variant.wholesalePrice !== null) {
          input.customFields = {
            wholesalePrice: Math.round(variant.wholesalePrice * 100), // Convert to cents
          };
        }

        const result = await client.mutate<
          UpdateProductVariantMutation,
          UpdateProductVariantMutationVariables
        >({
          mutation: UPDATE_PRODUCT_VARIANT,
          variables: {
            input,
          },
        });

        if (result.error) {
          console.error(`❌ Failed to update variant ${variant.id}:`, result.error);
          return false;
        }
      }

      return true;
    } catch (error: any) {
      console.error('❌ Failed to update variant details:', error);
      this.stateService.setError(error.message || 'Failed to update variant details');
      return false;
    }
  }
}
