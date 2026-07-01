import { Injectable, inject } from '@angular/core';
import { ProductApiService } from '../product/product-api.service';
import { ProductCacheService } from '../product/product-cache.service';
import { EmbedderService } from './embedder.service';
import { createRoiCanvas, drawCenteredRoi } from './frame-roi';

/** Cap enrolled photos per product — bounds embed time and stored fingerprint size. */
const MAX_ENROLL_PHOTOS = 12;

export interface EnrollmentResult {
  /** Number of fingerprints actually stored (0 = nothing enrolled). */
  enrolled: number;
}

/**
 * Turns a product's captured photos into stored recognition fingerprints.
 *
 * Composition only: EmbedderService (the SAME instance the scanner uses — identical preprocessing
 * via the shared ROI crop, so enroll↔scan embeddings match), ProductApiService (persist), and
 * ProductCacheService (same-session scannability). Owns no ML itself.
 *
 * Callers fire this and don't block on it — the first enrollment may download the model.
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly embedder = inject(EmbedderService);
  private readonly productApi = inject(ProductApiService);
  private readonly cache = inject(ProductCacheService);

  /**
   * Embed up to MAX_ENROLL_PHOTOS of the product's photos through the shared embedder and store
   * them (+ the embedder version) on the product. Per-photo failures are skipped, not fatal.
   */
  async enrollProduct(productId: string, photos: File[]): Promise<EnrollmentResult> {
    const files = (photos ?? []).slice(0, MAX_ENROLL_PHOTOS);
    if (!files.length) return { enrolled: 0 };

    await this.embedder.initialize(); // may download the model on first use

    const { canvas, ctx } = createRoiCanvas();
    if (!ctx) throw new Error('enroll: 2d context unavailable');

    const vectors: number[][] = [];
    for (const file of files) {
      try {
        const image = await loadImageFromBlob(file);
        // Same centered-square ROI as scanning — parity is the whole point.
        drawCenteredRoi(ctx, image, image.naturalWidth, image.naturalHeight);
        vectors.push(await this.embedder.embed(canvas));
      } catch (err) {
        console.warn('[Enrollment] skipped a photo:', err);
      }
    }
    if (!vectors.length) return { enrolled: 0 };

    const stored = await this.productApi.updateProductEmbedding(
      productId,
      JSON.stringify(vectors),
      this.embedder.version,
    );
    if (!stored) return { enrolled: 0 };

    // Make it recognizable this session without a network round-trip (and without clobbering the
    // cached product's other fields). No-op if the product isn't cached yet — the next prefetch
    // loads it with its fingerprint from the backend.
    this.cache.setProductFingerprint(productId, vectors, this.embedder.version);
    return { enrolled: vectors.length };
  }

  /** Remove a product's stored fingerprints (e.g. user disables recognition). */
  async clearEnrollment(productId: string): Promise<boolean> {
    const ok = await this.productApi.updateProductEmbedding(productId, null, null);
    if (ok) this.cache.setProductFingerprint(productId, [], '');
    return ok;
  }
}

/** Load an image File/Blob into a decoded HTMLImageElement. */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('enroll: image failed to load'));
    };
    image.src = url;
  });
}
