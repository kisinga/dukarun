import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ASSIGN_ASSETS_TO_CHANNEL } from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';

export interface AssetRef {
  id: string;
  preview: string;
  source: string;
}

/**
 * Shared service for uploading assets via the Vendure multipart upload protocol.
 * All asset uploads in the app should go through this service.
 */
@Injectable({ providedIn: 'root' })
export class AssetUploadService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  /**
   * Upload files as Vendure assets via the graphql-multipart-request-spec.
   * Returns the created asset references (id, preview, source).
   */
  async uploadAssets(files: File[]): Promise<AssetRef[]> {
    if (files.length === 0) return [];

    const mutation = `
      mutation CreateAssets($input: [CreateAssetInput!]!) {
        createAssets(input: $input) {
          ... on Asset { id preview source }
        }
      }
    `;

    const formData = new FormData();
    formData.append(
      'operations',
      JSON.stringify({
        query: mutation,
        variables: { input: files.map(() => ({ file: null })) },
      }),
    );

    const map: Record<string, string[]> = {};
    files.forEach((_, i) => {
      map[i.toString()] = [`variables.input.${i}.file`];
    });
    formData.append('map', JSON.stringify(map));

    files.forEach((file, i) => {
      formData.append(i.toString(), file, file.name);
    });

    const headers: Record<string, string> = {};
    const channelToken = this.apolloService.getChannelToken();
    if (channelToken) {
      headers['vendure-token'] = channelToken;
    }

    const response = await fetch(environment.apiUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(result.errors[0]?.message || 'Asset upload failed');
    }

    const assets: AssetRef[] = (result.data?.createAssets ?? []).filter(
      (a: any): a is AssetRef => !!a?.id,
    );

    if (assets.length === 0) {
      throw new Error('No assets created');
    }

    return assets;
  }

  /**
   * Upload files, then assign the created assets to the active channel.
   * This is the common path for most upload workflows.
   */
  async uploadAndAssignToChannel(files: File[]): Promise<AssetRef[]> {
    const assets = await this.uploadAssets(files);

    const channel = this.companyService.activeChannel();
    if (!channel?.id) {
      throw new Error('No active channel');
    }

    const client = this.apolloService.getClient();
    await client.mutate({
      mutation: ASSIGN_ASSETS_TO_CHANNEL as any,
      variables: {
        assetIds: assets.map((a) => a.id),
        channelId: channel.id,
      },
    });

    return assets;
  }
}
