import { Injectable, inject } from '@angular/core';
import gql from 'graphql-tag';
import JSZip from 'jszip';
import { ApolloService } from './apollo.service';

const TRAINING_MANIFEST_EXPORT_QUERY = gql`
  query TrainingManifestExport($channelId: ID!) {
    trainingManifestExport(channelId: $channelId) {
      manifestJson
    }
  }
`;

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
   * Fetch manifest, download each image in the browser, build zip, trigger download.
   * onProgress(current, total) is called as images are fetched.
   */
  async downloadImagesZip(
    channelId: string,
    channelCode: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const result = await this.apollo.getClient().query<{ trainingManifestExport: { manifestJson: string } }>({
      query: TRAINING_MANIFEST_EXPORT_QUERY,
      variables: { channelId },
      fetchPolicy: 'network-only',
    });
    const json = result.data?.trainingManifestExport?.manifestJson;
    if (!json) {
      throw new Error('No manifest data');
    }
    const manifest: TrainingManifestExport = JSON.parse(json);
    const products = manifest.products ?? [];
    // Count only images with URLs so progress (current/total) matches actual work done
    const total = products.reduce(
      (sum, p) => sum + (p.images ?? []).filter((img) => img?.url).length,
      0
    );
    if (total === 0) {
      throw new Error('No images in manifest');
    }

    const zip = new JSZip();
    let current = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (!product) continue;
      const images = product.images ?? [];
      const folderName = `${i}-${sanitizeFolderName(product.productName ?? '')}`;
      const productFolder = zip.folder(folderName);
      if (!productFolder) continue;

      for (let j = 0; j < images.length; j++) {
        const img = images[j];
        if (!img?.url) continue;
        try {
          const res = await fetch(img.url, { mode: 'cors', credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = getExtension(img.filename ?? '');
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
