import { inject, Injectable } from '@angular/core';
import {
  ASSIGN_ASSETS_TO_PRODUCT,
  DELETE_ASSET,
  UPDATE_PRODUCT_ASSETS,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { AssetUploadService } from '../asset-upload.service';
import { ProductApiService } from './product-api.service';
import { ProductStateService } from './product-state.service';

/**
 * Product Asset Service
 *
 * Handles product asset/photo operations.
 * Delegates file upload to the shared AssetUploadService.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductAssetService {
  private readonly apolloService = inject(ApolloService);
  private readonly assetUploadService = inject(AssetUploadService);
  private readonly stateService = inject(ProductStateService);
  private readonly apiService = inject(ProductApiService);

  /**
   * Upload product photos and assign them to a product.
   * Called AFTER product creation succeeds.
   * Non-blocking: if it fails, the product/variants remain created.
   */
  async uploadProductPhotos(productId: string, photos: File[]): Promise<string[] | null> {
    try {
      if (photos.length === 0) return [];

      // Step 1: Upload and assign to channel
      const assets = await this.assetUploadService.uploadAndAssignToChannel(photos);
      const assetIds = assets.map((a) => a.id);

      // Step 2: Assign assets to product
      const client = this.apolloService.getClient();
      const result = await client.mutate<any>({
        mutation: ASSIGN_ASSETS_TO_PRODUCT as any,
        variables: {
          productId,
          assetIds,
          featuredAssetId: assetIds[0],
        },
      });

      if (!result.data?.updateProduct) {
        console.error('Failed to assign assets to product');
        return null;
      }

      return assetIds;
    } catch (error: any) {
      console.error('Photo upload failed:', error.message);
      return null;
    }
  }

  /**
   * Update product assets (add new, remove old)
   */
  async updateProductAssets(
    productId: string,
    newPhotos: File[],
    removedAssetIds: string[],
  ): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();

      // Step 1: Delete removed assets
      for (const assetId of removedAssetIds) {
        try {
          await client.mutate({
            mutation: DELETE_ASSET as any,
            variables: { input: { id: assetId } },
          });
        } catch (error) {
          console.warn(`Failed to delete asset ${assetId}:`, error);
        }
      }

      // Step 2: Upload new photos if any
      let newAssetIds: string[] = [];
      if (newPhotos.length > 0) {
        const uploadedIds = await this.uploadProductPhotos(productId, newPhotos);
        if (uploadedIds) {
          newAssetIds = uploadedIds;
        } else {
          return false;
        }
      }

      // Step 3: Get current product assets (excluding removed ones)
      const product = await this.apiService.getProductById(productId);
      if (!product) return false;

      const currentAssetIds = (product.assets || [])
        .map((asset: any) => asset.id)
        .filter((id: string) => !removedAssetIds.includes(id));

      // Step 4: Update product with full asset list
      const allAssetIds = [...currentAssetIds, ...newAssetIds];
      const result = await client.mutate({
        mutation: UPDATE_PRODUCT_ASSETS as any,
        variables: {
          productId,
          assetIds: allAssetIds,
          featuredAssetId: allAssetIds[0] || null,
        },
      });

      return !!(result.data as any)?.updateProduct;
    } catch (error: any) {
      console.error('Update product assets failed:', error);
      this.stateService.setError(error.message || 'Failed to update product assets');
      return false;
    }
  }

  /**
   * Delete a single asset
   */
  async deleteAsset(assetId: string): Promise<boolean> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: DELETE_ASSET as any,
        variables: { input: { id: assetId } },
      });

      const deleteResult = (result.data as any)?.deleteAsset;
      if (deleteResult?.result === 'DELETED') return true;

      this.stateService.setError(deleteResult?.message || 'Failed to delete asset');
      return false;
    } catch (error: any) {
      console.error('Delete asset error:', error);
      this.stateService.setError(error.message || 'Failed to delete asset');
      return false;
    }
  }
}
