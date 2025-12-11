import { inject, Injectable } from '@angular/core';
import {
  ASSIGN_ASSETS_TO_CHANNEL,
  ASSIGN_ASSETS_TO_PRODUCT,
  DELETE_ASSET,
  UPDATE_PRODUCT_ASSETS,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { CompanyService } from '../company.service';
import { ProductApiService } from './product-api.service';
import { ProductStateService } from './product-state.service';

/**
 * Product Asset Service
 *
 * Handles product asset/photo operations.
 * Includes upload, update, and delete operations.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductAssetService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly stateService = inject(ProductStateService);
  private readonly apiService = inject(ProductApiService);

  /**
   * Upload product photos and assign them to a product
   * This is called AFTER product creation succeeds
   * Non-blocking: if it fails, the product/variants remain created
   *
   * ARCHITECTURE NOTE:
   * - Frontend handles upload directly (simple, works now)
   * - TODO Phase 2: Move to backend batch processor for reliability
   *
   * Uses GraphQL multipart upload protocol (graphql-multipart-request-spec)
   * Vendure admin-api uses cookie-based authentication, not Bearer tokens
   *
   * @param productId - Product ID to attach photos to
   * @param photos - Array of photo files
   * @returns Array of asset IDs, or null if failed
   */
  async uploadProductPhotos(productId: string, photos: File[]): Promise<string[] | null> {
    try {
      console.log(`📸 Starting upload of ${photos.length} photo(s) for product ${productId}`);

      if (photos.length === 0) {
        console.log('📸 No photos to upload');
        return [];
      }

      // Step 1: Upload files using multipart protocol to create assets
      const assetIds: string[] = [];
      const apiUrl = '/admin-api';
      const channelToken = this.apolloService.getChannelToken();

      // GraphQL mutation for creating assets
      const createAssetsMutation = `
                mutation CreateAssets($input: [CreateAssetInput!]!) {
                    createAssets(input: $input) {
                        ... on Asset {
                            id
                            name
                            preview
                            source
                        }
                    }
                }
            `;

      // Create FormData for multipart upload following graphql-multipart-request-spec
      const formData = new FormData();

      // Build the operations object with file placeholders
      const operations = {
        query: createAssetsMutation,
        variables: {
          input: photos.map(() => ({ file: null })),
        },
      };

      // Build the map object to link files to variables
      const map: Record<string, string[]> = {};
      photos.forEach((_, index) => {
        map[index.toString()] = [`variables.input.${index}.file`];
      });

      // Append operations and map
      formData.append('operations', JSON.stringify(operations));
      formData.append('map', JSON.stringify(map));

      // Append actual files
      photos.forEach((file, index) => {
        formData.append(index.toString(), file, file.name);
      });

      console.log('📸 Uploading files using multipart protocol...');

      // Send multipart request
      // IMPORTANT: Vendure admin-api uses cookie-based auth, NOT Bearer tokens
      // credentials: 'include' sends the session cookie automatically
      const headers: Record<string, string> = {};
      if (channelToken) {
        headers['vendure-token'] = channelToken;
      }
      // Note: Do NOT set Content-Type for FormData - browser sets it with boundary

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        credentials: 'include', // Send session cookie
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload HTTP error:', response.status, response.statusText);
        console.error('❌ Response body:', errorText);

        // Common error scenarios
        if (response.status === 403) {
          console.error('⚠️ Permission denied: User lacks CreateAsset or UpdateProduct permission');
          console.error('⚠️ Required permissions: CreateAsset, UpdateProduct');
        } else if (response.status === 401) {
          console.error('⚠️ Authentication failed: Session may have expired');
        }

        return null;
      }

      const result = await response.json();

      console.log('📸 Upload response:', {
        hasErrors: !!result.errors,
        hasData: !!result.data?.createAssets,
      });

      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        return null;
      }

      const createdAssets = result.data?.createAssets;
      if (!createdAssets || createdAssets.length === 0) {
        console.error('❌ No assets created');
        return null;
      }

      // Extract asset IDs
      for (const asset of createdAssets) {
        if (asset.id) {
          assetIds.push(asset.id);
          console.log(`✅ Asset created: ${asset.id} (${asset.name})`);
        }
      }

      if (assetIds.length === 0) {
        console.error('❌ No valid asset IDs returned');
        return null;
      }

      console.log(`✅ Created ${assetIds.length} assets`);

      // Step 2: Assign assets to channel
      console.log('🔗 Assigning assets to channel...');
      const channel = this.companyService.activeChannel();
      if (!channel?.id) {
        console.error('❌ No active channel found');
        return null;
      }

      const client = this.apolloService.getClient();
      const assignResult = await client.mutate({
        mutation: ASSIGN_ASSETS_TO_CHANNEL as any,
        variables: {
          assetIds,
          channelId: channel.id,
        },
      });

      if (assignResult.error || !assignResult.data) {
        console.error('❌ Failed to assign assets to channel:', assignResult.error);
        return null;
      }

      console.log('✅ Assets assigned to channel successfully');

      // Step 3: Assign assets to product using Apollo Client
      console.log('📸 Assigning assets to product...');
      const updateResult = await client.mutate<any>({
        mutation: ASSIGN_ASSETS_TO_PRODUCT as any,
        variables: {
          productId,
          assetIds,
          featuredAssetId: assetIds[0], // First asset as featured
        },
      });

      console.log('📸 ASSIGN_ASSETS_TO_PRODUCT result:', {
        success: !!updateResult.data?.updateProduct,
        error: updateResult.error?.message,
      });

      if (!updateResult.data?.updateProduct) {
        console.error('❌ Failed to assign assets to product');
        return null;
      }

      console.log(`✅ Successfully assigned ${assetIds.length} assets to product`);
      return assetIds;
    } catch (error: any) {
      console.error('❌ Photo upload failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
      });
      return null;
    }
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
    try {
      console.log('📸 Updating product assets:', {
        productId,
        newPhotosCount: newPhotos.length,
        removedCount: removedAssetIds.length,
      });

      const client = this.apolloService.getClient();

      // Step 1: Delete removed assets
      if (removedAssetIds.length > 0) {
        console.log('🗑️ Deleting removed assets...');
        for (const assetId of removedAssetIds) {
          try {
            await client.mutate({
              mutation: DELETE_ASSET as any,
              variables: { input: { id: assetId } },
            });
            console.log(`✅ Deleted asset: ${assetId}`);
          } catch (error) {
            console.warn(`⚠️ Failed to delete asset ${assetId}:`, error);
            // Continue with other deletions
          }
        }
      }

      // Step 2: Upload new photos if any
      let newAssetIds: string[] = [];
      if (newPhotos.length > 0) {
        console.log('📤 Uploading new photos...');
        const uploadedAssetIds = await this.uploadProductPhotos(productId, newPhotos);
        if (uploadedAssetIds) {
          newAssetIds = uploadedAssetIds;
          console.log(`✅ Uploaded ${newAssetIds.length} new assets`);
        } else {
          console.error('❌ Failed to upload new photos');
          return false;
        }
      }

      // Step 3: Get current product assets (excluding removed ones)
      const product = await this.apiService.getProductById(productId);
      if (!product) {
        console.error('❌ Product not found');
        return false;
      }

      // Get current asset IDs (excluding removed ones)
      const currentAssetIds = (product.assets || [])
        .map((asset: any) => asset.id)
        .filter((id: string) => !removedAssetIds.includes(id));

      // Combine current and new assets
      const allAssetIds = [...currentAssetIds, ...newAssetIds];
      const featuredAssetId = allAssetIds[0] || null; // First asset as featured

      // Step 4: Update product with new asset list
      console.log('🔄 Updating product assets...');
      const result = await client.mutate({
        mutation: UPDATE_PRODUCT_ASSETS as any,
        variables: {
          productId,
          assetIds: allAssetIds,
          featuredAssetId,
        },
      });

      if ((result.data as any)?.updateProduct) {
        console.log('✅ Product assets updated successfully');
        return true;
      } else {
        console.error('❌ Failed to update product assets');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Update product assets failed:', error);
      this.stateService.setError(error.message || 'Failed to update product assets');
      return false;
    }
  }

  /**
   * Delete a single asset
   * @param assetId - Asset ID to delete
   * @returns true if successful, false otherwise
   */
  async deleteAsset(assetId: string): Promise<boolean> {
    try {
      console.log('🗑️ Deleting asset:', assetId);
      const client = this.apolloService.getClient();

      const result = await client.mutate({
        mutation: DELETE_ASSET as any,
        variables: { input: { id: assetId } },
      });

      const deleteResult = (result.data as any)?.deleteAsset;

      if (deleteResult?.result === 'DELETED') {
        console.log('✅ Asset deleted successfully');
        return true;
      } else {
        console.error('❌ Asset deletion failed:', deleteResult?.message);
        this.stateService.setError(deleteResult?.message || 'Failed to delete asset');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Delete asset error:', error);
      this.stateService.setError(error.message || 'Failed to delete asset');
      return false;
    }
  }
}
