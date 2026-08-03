import { inject, Injectable } from '@angular/core';
import { ASSIGN_ASSETS_TO_PRODUCT, DELETE_ASSET, UPDATE_PRODUCT_ASSETS } from '@dukarun/company';
import { ApolloService } from '../../../shared/services/apollo.service';
import { AssetUploadService } from '@dukarun/company';
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
      const result = await client.mutate({
        mutation: ASSIGN_ASSETS_TO_PRODUCT,
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

      // Read the CURRENT asset list + featured BEFORE mutating anything, so we merge rather than
      // replace. (The old flow uploaded via the replacing uploadProductPhotos first, then re-read
      // the already-clobbered list — dropping existing photos and duplicating the new ones.)
      const product = await this.apiService.getProductById(productId);
      if (!product) return false;
      const keptAssetIds: string[] = (product.assets || [])
        .map((asset: any) => asset.id)
        .filter((id: string) => !removedAssetIds.includes(id));
      const currentFeaturedId: string | null = product.featuredAsset?.id ?? null;

      // Upload new files → asset ids (channel-assign only; do NOT assign to the product here, since
      // that path replaces the product's whole asset list).
      let newAssetIds: string[] = [];
      if (newPhotos.length > 0) {
        const uploaded = await this.assetUploadService.uploadAndAssignToChannel(newPhotos);
        newAssetIds = uploaded.map((a) => a.id);
        if (newAssetIds.length === 0) return false;
      }

      // Delete removed assets.
      for (const assetId of removedAssetIds) {
        try {
          await client.mutate({
            mutation: DELETE_ASSET,
            variables: { input: { assetId } },
          });
        } catch (error) {
          console.warn(`Failed to delete asset ${assetId}:`, error);
        }
      }

      // Write the merged list. Preserve the existing featured asset if it survived; else default to
      // the first asset.
      const allAssetIds = [...keptAssetIds, ...newAssetIds];
      const featuredAssetId =
        currentFeaturedId && allAssetIds.includes(currentFeaturedId)
          ? currentFeaturedId
          : (allAssetIds[0] ?? null);
      const result = await client.mutate({
        mutation: UPDATE_PRODUCT_ASSETS,
        variables: {
          productId,
          assetIds: allAssetIds,
          featuredAssetId,
        },
      });

      return !!result.data?.updateProduct;
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
        mutation: DELETE_ASSET,
        variables: { input: { assetId } },
      });

      const deleteResult = result.data?.deleteAsset;
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
