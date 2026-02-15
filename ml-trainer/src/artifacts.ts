/**
 * Artifact Management
 *
 * Handles downloading training images and cleanup of temporary files.
 * Model artifacts from Teachable Machine are normalized in export-normalizer.ts.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { DatasetItem, ProductManifestEntry } from './types';
import { logger } from './constants';

// =============================================================================
// Dataset Download
// =============================================================================

/**
 * Download all images from the training manifest to local disk.
 *
 * Creates a directory structure:
 * jobDir/
 *   images/
 *     0/  (first product)
 *       image1.jpg
 *       image2.jpg
 *     1/  (second product)
 *       ...
 *
 * @param products - Array of products with image URLs from manifest
 * @param jobDir - Directory to store downloaded images
 * @returns Dataset items (paths + label indices) and total image count
 */
export async function downloadDataset(
  products: ProductManifestEntry[],
  jobDir: string
): Promise<{ dataset: DatasetItem[]; totalImages: number }> {
  logger.info(`Downloading images for ${products.length} products...`);

  const imagesDir = path.join(jobDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const dataset: DatasetItem[] = [];
  let totalImages = 0;
  let failedDownloads = 0;

  for (let productIndex = 0; productIndex < products.length; productIndex++) {
    const product = products[productIndex];
    const productDir = path.join(imagesDir, productIndex.toString());

    if (!fs.existsSync(productDir)) {
      fs.mkdirSync(productDir, { recursive: true });
    }

    logger.info(`  Downloading images for product ${productIndex + 1}/${products.length}: ${product.productName}`);

    for (let imageIndex = 0; imageIndex < product.images.length; imageIndex++) {
      const image = product.images[imageIndex];

      try {
        // Determine file extension from URL or filename
        const ext = getFileExtension(image.url, image.filename);
        const filename = `${imageIndex}${ext}`;
        const imagePath = path.join(productDir, filename);

        // Download image
        await downloadImage(image.url, imagePath);

        // Add to dataset
        dataset.push({
          path: imagePath,
          labelIndex: productIndex,
        });

        totalImages++;
      } catch (error) {
        failedDownloads++;
        logger.warn(
          `    Failed to download image ${image.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  logger.info(`Download complete: ${totalImages} images downloaded, ${failedDownloads} failed`);

  if (totalImages === 0) {
    throw new Error('No images could be downloaded from the manifest');
  }

  // Warn if we have very few images per class
  const avgImagesPerClass = totalImages / products.length;
  if (avgImagesPerClass < 3) {
    logger.warn(
      `Low image count: average ${avgImagesPerClass.toFixed(1)} images per product. ` +
        `Consider adding more images for better accuracy.`
    );
  }

  return { dataset, totalImages };
}

/**
 * Download a single image from URL to local path.
 */
async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000, // 30 second timeout
    headers: {
      'User-Agent': 'DukarunMLTrainer/1.0',
    },
  });

  fs.writeFileSync(destPath, Buffer.from(response.data));
}

/**
 * Get file extension from URL or filename.
 */
function getFileExtension(url: string, filename: string): string {
  // Try to get extension from filename first
  const filenameExt = path.extname(filename).toLowerCase();
  if (filenameExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(filenameExt)) {
    return filenameExt;
  }

  // Try to get extension from URL
  try {
    const urlPath = new URL(url).pathname;
    const urlExt = path.extname(urlPath).toLowerCase();
    if (urlExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(urlExt)) {
      return urlExt;
    }
  } catch {
    // Invalid URL, continue with default
  }

  // Default to .jpg
  return '.jpg';
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Clean up temporary job directory after training completes.
 *
 * @param jobDir - Directory to remove
 */
export function cleanupJobDir(jobDir: string): void {
  try {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      logger.info(`Cleaned up job directory: ${jobDir}`);
    }
  } catch (error) {
    logger.warn(
      `Failed to cleanup job directory ${jobDir}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
