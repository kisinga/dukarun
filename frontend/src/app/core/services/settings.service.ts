import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import type { GetAuditLogsQuery, GetAuditLogsQueryVariables } from '../graphql/generated/graphql';
import { LanguageCode } from '../graphql/generated/graphql';
import {
  CREATE_CHANNEL_PAYMENT_METHOD,
  GET_AUDIT_LOGS,
  INVITE_CHANNEL_ADMINISTRATOR,
  UPDATE_CHANNEL_LOGO,
  UPDATE_CASHIER_SETTINGS,
  UPDATE_PRINTER_SETTINGS,
  UPDATE_CHANNEL_PAYMENT_METHOD,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { AssetUploadService } from './asset-upload.service';
import { CompanyService } from './company.service';

export interface ChannelSettings {
  cashierFlowEnabled: boolean;
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
  private readonly assetUploadService = inject(AssetUploadService);
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
      enablePrinter: customFields.enablePrinter ?? true,
      companyLogoAsset: customFields.companyLogoAsset ?? null,
    };
  });

  readonly cashierFlowEnabled = this.companyService.cashierFlowEnabled;
  readonly enablePrinter = this.companyService.enablePrinter;
  readonly companyLogoAsset = this.companyService.companyLogoAsset;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Update channel logo
   */
  async updateChannelLogo(logoAssetId?: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: UPDATE_CHANNEL_LOGO as any,
        variables: { logoAssetId },
      });

      if ((result.data as any)?.updateChannelLogo) {
        await this.companyService.fetchActiveChannel();
      }
    } catch (err) {
      console.error('Failed to update channel logo:', err);
      this.error.set('Failed to update channel logo');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update cashier settings
   */
  async updateCashierSettings(cashierFlowEnabled?: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: UPDATE_CASHIER_SETTINGS as any,
        variables: { cashierFlowEnabled },
      });

      if ((result.data as any)?.updateCashierSettings) {
        await this.companyService.fetchActiveChannel();
      }
    } catch (err) {
      console.error('Failed to update cashier settings:', err);
      this.error.set('Failed to update cashier settings');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update printer settings
   */
  async updatePrinterSettings(enablePrinter: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.mutate({
        mutation: UPDATE_PRINTER_SETTINGS as any,
        variables: { enablePrinter },
      });

      if ((result.data as any)?.updatePrinterSettings) {
        await this.companyService.fetchActiveChannel();
      }
    } catch (err) {
      console.error('Failed to update printer settings:', err);
      this.error.set('Failed to update printer settings');
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
      const assets = await this.assetUploadService.uploadAndAssignToChannel([file]);
      return assets[0]?.id ?? null;
    } catch (err) {
      console.error('Failed to upload logo:', err);
      this.error.set('Failed to upload logo');
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
