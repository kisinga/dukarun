import { inject, Injectable } from '@angular/core';
import { CompanyService } from '../company.service';

export interface ModelSources {
  modelUrl: string;
  weightsUrl: string;
  metadataUrl: string;
}

/**
 * Service for resolving ML model asset URLs from channel custom fields
 * Handles conversion from Vendure asset sources to proxy-compatible URLs
 */
@Injectable({
  providedIn: 'root',
})
export class ModelSourceResolverService {
  private readonly companyService = inject(CompanyService);

  // Cache for asset sources to prevent duplicate queries
  private assetSourcesCache = new Map<string, ModelSources | null>();

  /**
   * Get ML model asset sources for a channel
   * Returns file paths needed to load the model
   * Uses CompanyService as single source of truth for channel custom fields
   *
   * ARCHITECTURE:
   * - Direct Asset objects from channel custom fields → No secondary query needed
   */
  async getModelSources(channelId: string): Promise<ModelSources | null> {
    // Check cache first to prevent duplicate queries
    const cacheKey = channelId;
    if (this.assetSourcesCache.has(cacheKey)) {
      return this.assetSourcesCache.get(cacheKey) || null;
    }

    // Get asset objects from CompanyService
    const mlModelAssets = this.companyService.mlModelAssets();

    if (!mlModelAssets) {
      console.warn('❌ ML model assets not configured for this channel');
      this.assetSourcesCache.set(cacheKey, null);
      return null;
    }

    try {
      const { mlModelJsonAsset, mlModelBinAsset, mlMetadataAsset } = mlModelAssets;

      // Helper: convert source to proxy-compatible URL
      const toProxyUrl = (source: string): string => {
        // If source is already a full URL, extract the path for proxy compatibility
        if (source.startsWith('http://') || source.startsWith('https://')) {
          // Extract path from full URL for proxy compatibility
          // "http://localhost:3000/assets/source/fa/model__02.json" -> "/assets/source/fa/model__02.json"
          const url = new URL(source);
          return url.pathname;
        }
        // The source field from Vendure contains the relative path within asset storage
        // We need to construct the proper asset URL by prepending /assets/
        // Source format: "source/49/metadata.json" -> URL: "/assets/source/49/metadata.json"
        return `/assets/${source}`;
      };

      const sources: ModelSources = {
        modelUrl: toProxyUrl(mlModelJsonAsset.source),
        weightsUrl: toProxyUrl(mlModelBinAsset.source),
        metadataUrl: toProxyUrl(mlMetadataAsset.source),
      };

      console.log('✅ ML model sources resolved from channel custom fields:', {
        modelAsset: { id: mlModelJsonAsset.id, name: mlModelJsonAsset.name },
        weightsAsset: { id: mlModelBinAsset.id, name: mlModelBinAsset.name },
        metadataAsset: { id: mlMetadataAsset.id, name: mlMetadataAsset.name },
        sources,
      });

      // Cache the results to prevent duplicate processing
      this.assetSourcesCache.set(cacheKey, sources);
      return sources;
    } catch (error: any) {
      console.error('❌ Failed to process ML model assets:', error);
      console.error('❌ Error details:', {
        message: error.message,
        mlModelAssets,
      });

      // Cache the failure to prevent repeated attempts
      this.assetSourcesCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Clear asset sources cache (useful when channel changes)
   */
  clearCache(): void {
    this.assetSourcesCache.clear();
  }
}
