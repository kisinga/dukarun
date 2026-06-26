import { inject, Injectable } from '@angular/core';
import {
  ADD_OPTION_GROUP_TO_PRODUCT,
  CREATE_PRODUCT_OPTION_GROUP,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { VariantInput } from '../product.service';

/**
 * Product Option Service
 *
 * Handles option group creation and management for variants.
 * Creates option groups when products have multiple variants.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductOptionService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Create option group with options for variant differentiation
   * Vendure requires options to be provided when creating the option group
   * This creates the group and all options in one mutation, then assigns to product
   */
  async createVariantOptionGroup(
    productId: string,
    productName: string,
    variants: VariantInput[],
  ): Promise<{ optionGroupId: string; variantsWithOptions: VariantInput[] }> {
    try {
      const client = this.apolloService.getClient();

      // Generate unique option group code
      const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const optionGroupCode = `variants-${randomId}`;
      const optionGroupName = `${productName} Variants`;

      // Prepare options for each variant (required by Vendure)
      const options = variants.map((variant, i) => ({
        code: `option-${i + 1}`,
        translations: [
          {
            languageCode: 'en' as any,
            name: variant.name,
          },
        ],
      }));

      console.log('🔧 Creating option group with options:', {
        code: optionGroupCode,
        optionCount: options.length,
      });

      // Create option group WITH options (required by Vendure)
      const result = await client.mutate({
        mutation: CREATE_PRODUCT_OPTION_GROUP,
        variables: {
          input: {
            code: optionGroupCode,
            translations: [
              {
                languageCode: 'en' as any,
                name: optionGroupName,
              },
            ],
            options: options,
          },
        },
      });

      console.log('🔧 Option group creation result:', {
        data: result.data,
        error: result.error,
        hasData: !!result.data,
        hasOptionGroup: !!result.data?.createProductOptionGroup,
      });

      // Check for Apollo errors first
      if (result.error) {
        console.error('❌ Apollo error in option group creation:', result.error);
        throw new Error(`GraphQL Error: ${result.error.message}`);
      }

      const optionGroup = result.data?.createProductOptionGroup;
      if (!optionGroup?.id) {
        console.error('❌ No option group ID in response:', {
          data: result.data,
          error: result.error,
          createProductOptionGroup: optionGroup,
        });
        throw new Error('Failed to get option group ID - mutation returned no data');
      }

      console.log('✅ Option group created with ID:', optionGroup.id);
      console.log('✅ Options created:', optionGroup.options?.length || 0);

      // Add the option group to the product
      const addResult = await client.mutate({
        mutation: ADD_OPTION_GROUP_TO_PRODUCT,
        variables: {
          productId,
          optionGroupId: optionGroup.id,
        },
      });

      if (addResult.error) {
        throw new Error(`Failed to add option group to product: ${addResult.error.message}`);
      }

      console.log('✅ Option group added to product');

      // Map option IDs back to variants
      const variantsWithOptions = variants.map((variant, i) => ({
        ...variant,
        optionIds: [optionGroup.options[i].id],
      }));

      return {
        optionGroupId: optionGroup.id,
        variantsWithOptions,
      };
    } catch (error) {
      console.error('❌ Failed to create option group:', error);
      throw error;
    }
  }
}
