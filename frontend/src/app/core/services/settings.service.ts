import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { GetAuditLogsQuery, GetAuditLogsQueryVariables } from '../graphql/generated/graphql';
import { LanguageCode } from '../graphql/generated/graphql';
import {
  CREATE_CHANNEL_PAYMENT_METHOD,
  GET_AUDIT_LOGS,
  INVITE_CHANNEL_ADMINISTRATOR,
  UPDATE_CHANNEL_PAYMENT_METHOD,
  UPDATE_CHANNEL_SETTINGS,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';

export interface ChannelSettings {
  cashierFlowEnabled: boolean;
  cashierOpen: boolean;
  enablePrinter: boolean;
  companyLogoAsset?: {
    id: string;
    source: string;
    preview: string;
  } | null;
}

export interface Administrator {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  user?: {
    id: string;
    identifier: string;
    verified: boolean;
    roles?: Array<{
      id: string;
      code: string;
      channels?: Array<{ id: string }>;
    }>;
  } | null;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  customFields?: {
    imageAsset?: {
      id: string;
      preview: string;
    } | null;
    isActive?: boolean | null;
  } | null;
}

export interface UpdateChannelSettingsInput {
  cashierFlowEnabled?: boolean;
  cashierOpen?: boolean;
  enablePrinter?: boolean;
  companyLogoAssetId?: string | null;
}

export interface InviteAdministratorInput {
  emailAddress?: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  roleTemplateCode?: string;
  permissionOverrides?: string[];
}

export interface CreatePaymentMethodInput {
  name: string;
  code: string;
  description?: string;
  imageAssetId?: string;
  enabled: boolean;
  handler: {
    code: string;
    arguments: any[];
  };
  translations: Array<{
    languageCode: LanguageCode;
    name: string;
    description?: string;
  }>;
}

export interface UpdatePaymentMethodInput {
  id: string;
  name?: string;
  description?: string;
  imageAssetId?: string;
  isActive?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  channelId: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  data: Record<string, any>;
  source: string;
}

export interface AuditLogOptions {
  entityType?: string;
  entityId?: string;
  userId?: string;
  eventType?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  skip?: number;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);

  // Signals for reactive state
  readonly channelSettings = computed<ChannelSettings | null>(() => {
    const channel = this.companyService.activeChannel();
    const customFields = channel?.customFields;

    if (!customFields) {
      return null;
    }

    return {
      cashierFlowEnabled: customFields.cashierFlowEnabled ?? false,
      cashierOpen: customFields.cashierOpen ?? false,
      enablePrinter: customFields.enablePrinter ?? true,
      companyLogoAsset: customFields.companyLogoAsset ?? null,
    };
  });

  readonly cashierFlowEnabled = this.companyService.cashierFlowEnabled;
  readonly cashierOpen = this.companyService.cashierOpen;
  readonly enablePrinter = this.companyService.enablePrinter;
  readonly companyLogoAsset = this.companyService.companyLogoAsset;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Update channel settings
   */
  async updateChannelSettings(input: UpdateChannelSettingsInput): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: UPDATE_CHANNEL_SETTINGS,
        variables: { input },
      });

      if (result.data?.updateChannelSettings) {
        await this.companyService.fetchActiveChannel();
      }
    } catch (err) {
      console.error('Failed to update channel settings:', err);
      this.error.set('Failed to update channel settings');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Invite a new administrator
   */
  async inviteAdministrator(input: InviteAdministratorInput): Promise<Administrator | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      if (!input.phoneNumber) {
        throw new Error('phoneNumber is required');
      }
      const result = await client.mutate({
        mutation: INVITE_CHANNEL_ADMINISTRATOR,
        variables: { input },
      });

      if (result.data?.inviteChannelAdministrator) {
        const admin = result.data.inviteChannelAdministrator;
        // Map GraphQL response to Administrator interface
        // Note: inviteChannelAdministrator response doesn't include verified field
        return {
          ...admin,
          user: admin.user
            ? {
                ...admin.user,
                verified: false, // Default to false since not in response
                roles: admin.user.roles?.map((role) => ({
                  id: role.id,
                  code: role.code,
                  permissions: role.permissions ?? [],
                  channels: [],
                })),
              }
            : null,
        } as Administrator;
      }
      return null;
    } catch (err) {
      console.error('Failed to invite administrator:', err);
      this.error.set('Failed to invite administrator');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new payment method
   */
  async createPaymentMethod(input: CreatePaymentMethodInput): Promise<PaymentMethod | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: CREATE_CHANNEL_PAYMENT_METHOD,
        variables: { input },
      });

      if (result.data?.createChannelPaymentMethod) {
        return result.data.createChannelPaymentMethod as PaymentMethod;
      }
      return null;
    } catch (err) {
      console.error('Failed to create payment method:', err);
      this.error.set('Failed to create payment method');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update a payment method
   */
  async updatePaymentMethod(input: UpdatePaymentMethodInput): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      await client.mutate({
        mutation: UPDATE_CHANNEL_PAYMENT_METHOD,
        variables: { input },
      });
    } catch (err) {
      console.error('Failed to update payment method:', err);
      this.error.set('Failed to update payment method');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.error.set(null);
  }

  /**
   * Upload logo image and return asset ID
   */
  async uploadLogo(file: File): Promise<string | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      console.log('🚀 Starting logo upload:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      // Use the same pattern as product service - direct fetch with FormData
      const apiUrl = `${environment.apiUrl}`;

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
          input: [{ file: null }],
        },
      };

      // Build the map object to link files to variables
      const map = {
        '0': ['variables.input.0.file'],
      };

      // Append operations and map
      formData.append('operations', JSON.stringify(operations));
      formData.append('map', JSON.stringify(map));

      // Append actual file
      formData.append('0', file, file.name);

      console.log('📤 Uploading logo using multipart protocol...');

      // Get channel token for the request
      const channelToken = this.apolloService.getChannelToken();

      // Send multipart request
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
        this.error.set(`Upload failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const result = await response.json();

      console.log('📤 Upload response:', {
        hasErrors: !!result.errors,
        hasData: !!result.data?.createAssets,
      });

      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        this.error.set(`Upload failed: ${result.errors[0]?.message || 'Unknown error'}`);
        return null;
      }

      const createdAssets = result.data?.createAssets;
      if (!createdAssets || createdAssets.length === 0) {
        console.error('❌ No assets created');
        this.error.set('Upload failed: No assets created');
        return null;
      }

      const asset = createdAssets[0];
      if (asset.id) {
        console.log('✅ Upload successful, asset ID:', asset.id);
        return asset.id;
      }

      console.error('❌ No valid asset ID returned');
      this.error.set('Upload failed: No valid asset ID returned');
      return null;
    } catch (err) {
      console.error('❌ Upload error:', err);
      this.error.set(
        `Failed to upload logo: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Get audit logs with pagination and optional filters
   */
  getAuditLogs(options: AuditLogOptions = {}): Observable<AuditLog[]> {
    const client = this.apolloService.getClient();

    // Convert Date objects to ISO strings if needed
    const variables: GetAuditLogsQueryVariables = {
      options: {
        ...options,
        startDate:
          options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate,
        endDate: options.endDate instanceof Date ? options.endDate.toISOString() : options.endDate,
      },
    };

    const queryPromise = client.query<GetAuditLogsQuery>({
      query: GET_AUDIT_LOGS,
      variables,
      fetchPolicy: 'network-only',
    });

    return from(queryPromise).pipe(
      map((result) => {
        console.log('Audit logs query result:', result);
        const logs = result.data?.auditLogs ?? [];
        console.log(`Received ${logs.length} audit logs from API`);
        return logs
          .filter((log): log is NonNullable<typeof log> => log != null)
          .map(
            (log): AuditLog => ({
              id: log.id,
              timestamp: log.timestamp,
              channelId: log.channelId,
              eventType: log.eventType,
              entityType: log.entityType ?? null,
              entityId: log.entityId ?? null,
              userId: log.userId ?? null,
              data: log.data as Record<string, any>,
              source: log.source,
            }),
          );
      }),
      catchError((error) => {
        console.error('Error fetching audit logs:', error);
        console.error('Error details:', {
          message: error.message,
          graphQLErrors: error.graphQLErrors,
          networkError: error.networkError,
        });
        throw error;
      }),
    );
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.loading.set(false);
    this.error.set(null);
  }
}
