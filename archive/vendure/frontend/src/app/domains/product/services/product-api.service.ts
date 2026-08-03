import { inject, Injectable } from '@angular/core';
import {
  CREATE_PRODUCT,
  DELETE_PRODUCT,
  GET_PRODUCT_DETAIL,
  UPDATE_PRODUCT_BASIC,
  UPDATE_PRODUCT_EMBEDDING,
  UPDATE_PRODUCT_WITH_FACETS,
} from '../operations.graphql';
import { ApolloService } from '../../../shared/services/apollo.service';
import { ProductInput } from './product.service';
import { normalizeBarcodeForApi } from './barcode.util';
import { ProductStateService } from './product-state.service';

/**
 * Product API Service
 *
 * Handles all GraphQL operations for product CRUD.
 * Pure API layer with no business logic.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductApiService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(ProductStateService);

  /**
   * Create a product (step 1)
   */
  async createProduct(input: ProductInput): Promise<string | null> {
    try {
      const client = this.apolloService.getClient();

      // Prepare input for Vendure (this form owns all facet assignments; no merge)
      const createInput: any = {
        enabled: input.enabled,
        translations: [
          {
            languageCode: 'en' as any,
            name: input.name,
            slug: this.generateSlug(input.name),
            description: input.description,
          },
        ],
        customFields: (() => {
          const b = normalizeBarcodeForApi(input.barcode);
          return b ? { barcode: b } : undefined;
        })(),
        facetValueIds:
          input.facetValueIds && input.facetValueIds.length > 0 ? input.facetValueIds : undefined,
      };

      const result = await client.mutate({
        mutation: CREATE_PRODUCT,
        variables: { input: createInput },
      });

      return result.data?.createProduct?.id || null;
    } catch (error: unknown) {
      console.error('Product creation failed:', error);
      const message =
        (error as { graphQLErrors?: Array<{ message?: string }> })?.graphQLErrors?.[0]?.message ??
        (error as Error)?.message;
      throw new Error(message || 'Failed to create product');
    }
  }

  /**
   * Update basic product information: name, slug, barcode, and optionally facet value IDs.
   * When facetValueIds is provided, this form owns all facet assignments (full replacement).
   * When omitted, facets are left unchanged (e.g. when updating from product-edit page).
   */
  async updateProduct(
    productId: string,
    payload: {
      name: string;
      barcode?: string;
      facetValueIds?: string[];
    },
  ): Promise<boolean> {
    const slug = this.generateSlug(payload.name);
    const hasFacets = payload.facetValueIds !== undefined;

    try {
      const client = this.apolloService.getClient();
      const baseVariables = {
        id: productId,
        name: payload.name,
        slug,
        barcode: normalizeBarcodeForApi(payload.barcode) ?? null,
      };
      const result = hasFacets
        ? await client.mutate({
            mutation: UPDATE_PRODUCT_WITH_FACETS,
            variables: { ...baseVariables, facetValueIds: payload.facetValueIds ?? [] },
          })
        : await client.mutate({
            mutation: UPDATE_PRODUCT_BASIC,
            variables: baseVariables,
          });

      return !!result.data?.updateProduct?.id;
    } catch (error) {
      console.error('Failed to update product:', error);
      return false;
    }
  }

  /**
   * Write a product's on-device recognition fingerprint(s) + embedder version. Pass nulls to clear.
   *
   * Only the two ML custom fields are sent; Vendure does a partial custom-field update, so the
   * product's other custom fields (e.g. barcode) are preserved.
   */
  async updateProductEmbedding(
    productId: string,
    embeddingJson: string | null,
    embedderVersion: string | null,
  ): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: UPDATE_PRODUCT_EMBEDDING,
        variables: {
          id: productId,
          mlEmbedding: embeddingJson,
          mlEmbeddingVersion: embedderVersion,
        },
      });
      return !!result.data?.updateProduct?.id;
    } catch (error) {
      console.error('Failed to write product embedding:', error);
      return false;
    }
  }

  /**
   * Get product details by ID
   */
  async getProductById(id: string): Promise<any | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_PRODUCT_DETAIL,
        variables: { id },
        fetchPolicy: 'network-only',
      });
      return result.data?.product || null;
    } catch (error) {
      console.error('Failed to fetch product:', error);
      return null;
    }
  }

  /**
   * Delete a product by ID
   * @param productId - The ID of the product to delete
   * @returns true if successful, false otherwise
   */
  async deleteProduct(productId: string): Promise<boolean> {
    try {
      console.log('🗑️ Deleting product:', productId);
      const client = this.apolloService.getClient();

      const result = await client.mutate({
        mutation: DELETE_PRODUCT,
        variables: { id: productId },
      });

      const deleteResult = result.data?.deleteProduct;

      if (deleteResult?.result === 'DELETED') {
        console.log('✅ Product deleted successfully');
        return true;
      } else {
        console.error('❌ Delete failed:', deleteResult?.message);
        this.stateService.setError(deleteResult?.message || 'Failed to delete product');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Delete product error:', error);
      this.stateService.setError(error.message || 'Failed to delete product');
      return false;
    }
  }

  /**
   * Generate a URL-friendly slug from product name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-'); // Remove duplicate hyphens
  }
}
