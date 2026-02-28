import { Injectable, inject } from '@angular/core';
import type { DocumentNode } from 'graphql';
import JSZip from 'jszip';
import { ApolloService } from './apollo.service';
import { TRAINING_MANIFEST_EXPORT } from '../graphql/operations.graphql';

export interface TrainingManifestProduct {
  productId: string;
  productName: string;
  images: Array<{ assetId: string; url: string; filename: string }>;
}

export interface TrainingManifestExport {
  channelId: string;
  version: string;
  extractedAt: string;
  products: TrainingManifestProduct[];
}

@Injectable({ providedIn: 'root' })
export class TrainingExportService {
  private readonly apollo = inject(ApolloService);

  /**
   * Fetch manifest JSON and trigger browser download.
   */
  async downloadManifestJson(channelId: string, channelCode: string): Promise<void> {
    const result = await this.apollo.getClient().query<{ trainingManifestExport: { manifestJson: string } }>({
      query: TRAINING_MANIFEST_EXPORT as DocumentNode,
      variables: { channelId },
      fetchPolicy: 'network-only',
    });
    const json = result.data?.trainingManifestExport?.manifestJson;
    if (!json) {
      throw new Error('No manifest data');
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-manifest-${channelCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Fetch manifest, download each image in the browser, build zip, trigger download.
   * onProgress(current, total) is called as images are fetched.
   */
  async downloadImagesZip(
    channelId: string,
    channelCode: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const result = await this.apollo.getClient().query<{ trainingManifestExport: { manifestJson: string } }>({
      query: TRAINING_MANIFEST_EXPORT as DocumentNode,
      variables: { channelId },
      fetchPolicy: 'network-only',
    });
    const json = result.data?.trainingManifestExport?.manifestJson;
    if (!json) {
      throw new Error('No manifest data');
    }
    const manifest: TrainingManifestExport = JSON.parse(json);
    const total = manifest.products.reduce((sum, p) => sum + p.images.length, 0);
    if (total === 0) {
      throw new Error('No images in manifest');
    }

    const zip = new JSZip();
    let current = 0;

    for (let i = 0; i < manifest.products.length; i++) {
      const product = manifest.products[i];
      const folderName = `${i}-${sanitizeFolderName(product.productName)}`;
      const productFolder = zip.folder(folderName);
      if (!productFolder) continue;

      for (let j = 0; j < product.images.length; j++) {
        const img = product.images[j];
        try {
          const res = await fetch(img.url, { mode: 'cors', credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = getExtension(img.filename);
          productFolder.file(`${j}${ext}`, blob);
        } catch (err) {
          console.warn(`Failed to fetch image ${img.url}:`, err);
        }
        current++;
        onProgress?.(current, total);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-images-${channelCode}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i === -1) return '.jpg';
  return filename.slice(i).toLowerCase() || '.jpg';
}
