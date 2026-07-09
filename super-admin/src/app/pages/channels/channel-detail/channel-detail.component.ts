import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { gql } from '@apollo/client/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../shared/components/page-header';
import { ApolloService } from '../../../core/services/apollo.service';
import {
  PLATFORM_ZONES,
  CHANNEL_DETAIL_PLATFORM,
  ANALYTICS_STATS_FOR_CHANNEL,
  AUDIT_LOGS_FOR_CHANNEL,
  ADMINISTRATORS_FOR_CHANNEL,
  NOTIFICATIONS_FOR_CHANNEL,
  UPDATE_CHANNEL_STATUS_PLATFORM,
  EXTEND_TRIAL_PLATFORM,
  UPDATE_CHANNEL_SUBSCRIPTION_PLATFORM,
  UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM,
  UPDATE_CHANNEL_ZONES_PLATFORM,
  UPDATE_CHANNEL_PUBLIC_STOREFRONT_PLATFORM,
} from '../../../core/graphql/operations.graphql';

interface PlatformZone {
  id: string;
  name: string;
}

interface PlatformChannel {
  id: string;
  code: string;
  token: string;
  customFields: {
    status: string;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    subscriptionExpiresAt: string | null;
    subscriptionExemptUntil: string | null;
    subscriptionExemptReason: string | null;
    maxAdminCount: number;
    cashierFlowEnabled: boolean;
    cashControlEnabled: boolean;
    enablePrinter: boolean;
    smsUsedThisPeriod?: number;
    smsPeriodEnd?: string | null;
    smsLimitFromTier?: number | null;
    publicStorefrontEnabled?: boolean;
    publicSlug?: string | null;
    publicWhatsAppNumber?: string | null;
  };
  defaultShippingZone?: PlatformZone | null;
  defaultTaxZone?: PlatformZone | null;
}

export interface PlatformAdministrator {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  roleCodes: string[];
}

export interface ChannelNotification {
  id: string;
  userId: string;
  channelId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

type NotificationCategory = 'customer' | 'orders' | 'stock' | 'finance' | 'operations';

interface ChannelNotificationPreferences {
  customer: boolean;
  orders: boolean;
  stock: boolean;
  finance: boolean;
  operations: boolean;
}

const NOTIFICATION_PREFERENCES_FOR_CHANNEL = gql`
  query NotificationPreferencesForChannel($channelId: ID!) {
    notificationPreferencesForChannel(channelId: $channelId) {
      customer
      orders
      stock
      finance
      operations
    }
  }
`;

const UPDATE_NOTIFICATION_PREFERENCES_FOR_CHANNEL = gql`
  mutation UpdateNotificationPreferencesForChannel($channelId: ID!, $input: ChannelNotificationPreferencesInput!) {
    updateNotificationPreferencesForChannel(channelId: $channelId, input: $input) {
      customer
      orders
      stock
      finance
      operations
    }
  }
`;

@Component({
  selector: 'app-channel-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, PageHeaderComponent],
  templateUrl: './channel-detail.component.html',
  styleUrl: './channel-detail.component.scss',
})
export class ChannelDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly apollo = inject(ApolloService);

  channel = signal<PlatformChannel | null>(null);
  zones = signal<PlatformZone[]>([]);
  analytics = signal<Record<string, unknown> | null>(null);
  auditLogs = signal<any[]>([]);
  admins = signal<PlatformAdministrator[]>([]);
  notifications = signal<ChannelNotification[]>([]);
  notificationPreferences = signal<ChannelNotificationPreferences>({
    customer: true,
    orders: true,
    stock: true,
    finance: true,
    operations: true,
  });
  loading = signal(true);
  error = signal<string | null>(null);

  statusOptions = ['UNAPPROVED', 'APPROVED', 'DISABLED', 'BANNED'];
  subscriptionStatusOptions = ['trial', 'active', 'expired', 'cancelled'];
  newStatus = signal('');
  newSubscriptionStatus = signal('');
  newTrialEndsAt = signal('');
  newSubscriptionExpiresAt = signal('');
  newSubscriptionExemptUntil = signal('');
  newSubscriptionExemptReason = signal('');
  newMaxAdminCount = signal<number>(5);
  selectedShippingZoneId = signal('');
  selectedTaxZoneId = signal('');
  cashierFlowEnabled = signal(false);
  cashControlEnabled = signal(true);
  enablePrinter = signal(true);
  publicStorefrontEnabled = signal(false);
  publicSlug = signal('');
  publicWhatsAppNumber = signal('');
  storefrontError = signal<string | null>(null);
  storefrontSaved = signal(false);
  saving = signal(false);
  savingNotificationCategory = signal<NotificationCategory | null>(null);
  notificationPreferencesAvailable = signal(false);
  notificationPreferencesError = signal<string | null>(null);

  readonly notificationCategories: ReadonlyArray<{
    key: NotificationCategory;
    label: string;
    description: string;
  }> = [
    {
      key: 'customer',
      label: 'Customer notifications',
      description: 'Customer activity alerts and messages sent directly to customers',
    },
    {
      key: 'orders',
      label: 'Sales & orders',
      description: 'Order payment, fulfilment and cancellation updates',
    },
    {
      key: 'stock',
      label: 'Stock',
      description: 'Low-stock and inventory alerts',
    },
    {
      key: 'finance',
      label: 'Money & billing',
      description: 'Subscription, billing and shift alerts',
    },
    {
      key: 'operations',
      label: 'Operations',
      description: 'Approvals, channel status and administrative alerts',
    },
  ];

  id = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  // Preview of the resulting public subdomain. Base domain matches the backend STOREFRONT_BASE_DOMAIN.
  storefrontUrl = computed(() => {
    const s = this.publicSlug().trim().toLowerCase();
    return s ? `https://${s}.dukarun.com` : '';
  });

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const client = this.apollo.getClient();
    try {
      const [chResult, zonesResult, analyticsResult, auditResult, adminsResult, notificationsResult, notificationPreferencesResult] = await Promise.all([
        client.query<{ channelDetailPlatform: PlatformChannel | null }>({
          query: CHANNEL_DETAIL_PLATFORM,
          variables: { channelId: id },
          fetchPolicy: 'network-only',
        }),
        client.query<{ platformZones: PlatformZone[] }>({
          query: PLATFORM_ZONES,
          fetchPolicy: 'network-only',
        }),
        client
          .query({
            query: ANALYTICS_STATS_FOR_CHANNEL,
            variables: {
              channelId: id,
              timeRange: this.defaultTimeRange(),
              limit: 10,
            },
            fetchPolicy: 'network-only',
          })
          .catch(() => ({ data: null })),
        client
          .query({
            query: AUDIT_LOGS_FOR_CHANNEL,
            variables: { channelId: id, options: { limit: 20 } },
            fetchPolicy: 'network-only',
          })
          .catch(() => ({ data: { auditLogsForChannel: [] } })),
        client
          .query<{ administratorsForChannel: PlatformAdministrator[] }>({
            query: ADMINISTRATORS_FOR_CHANNEL,
            variables: { channelId: id },
            fetchPolicy: 'network-only',
          })
          .catch(() => ({ data: { administratorsForChannel: [] } })),
        client
          .query<{ notificationsForChannel: { items: ChannelNotification[] } }>({
            query: NOTIFICATIONS_FOR_CHANNEL,
            variables: { channelId: id, options: { take: 50 } },
            fetchPolicy: 'network-only',
          })
          .catch(() => ({ data: { notificationsForChannel: { items: [] } } })),
        client
          .query<{
            notificationPreferencesForChannel: ChannelNotificationPreferences;
          }>({
            query: NOTIFICATION_PREFERENCES_FOR_CHANNEL,
            variables: { channelId: id },
            fetchPolicy: 'network-only',
          })
          .catch(() => ({ data: null })),
      ]);
      const ch = chResult.data?.channelDetailPlatform ?? null;
      this.channel.set(ch);
      this.zones.set(zonesResult.data?.platformZones ?? []);
      if (ch) {
        this.newStatus.set(ch.customFields.status);
        this.newSubscriptionStatus.set(ch.customFields.subscriptionStatus);
        if (ch.customFields.trialEndsAt) {
          this.newTrialEndsAt.set(ch.customFields.trialEndsAt.toString().slice(0, 10));
        }
        if (ch.customFields.subscriptionExpiresAt) {
          this.newSubscriptionExpiresAt.set(ch.customFields.subscriptionExpiresAt.toString().slice(0, 10));
        }
        if (ch.customFields.subscriptionExemptUntil) {
          this.newSubscriptionExemptUntil.set(ch.customFields.subscriptionExemptUntil.toString().slice(0, 10));
        }
        this.newSubscriptionExemptReason.set(ch.customFields.subscriptionExemptReason ?? '');

        const max = ch.customFields.maxAdminCount;
        this.newMaxAdminCount.set(typeof max === 'number' && max > 0 ? max : 5);
        this.selectedShippingZoneId.set(ch.defaultShippingZone?.id ?? '');
        this.selectedTaxZoneId.set(ch.defaultTaxZone?.id ?? '');
        this.cashierFlowEnabled.set(ch.customFields.cashierFlowEnabled);
        this.cashControlEnabled.set(ch.customFields.cashControlEnabled);
        this.enablePrinter.set(ch.customFields.enablePrinter);
        this.publicStorefrontEnabled.set(ch.customFields.publicStorefrontEnabled ?? false);
        this.publicSlug.set(ch.customFields.publicSlug ?? '');
        this.publicWhatsAppNumber.set(ch.customFields.publicWhatsAppNumber ?? '');
      }
      this.analytics.set((analyticsResult.data as any)?.analyticsStatsForChannel ?? null);
      this.auditLogs.set((auditResult.data as any)?.auditLogsForChannel ?? []);
      this.admins.set(adminsResult.data?.administratorsForChannel ?? []);
      this.notifications.set(
        (notificationsResult.data as { notificationsForChannel?: { items: ChannelNotification[] } })?.notificationsForChannel?.items ?? []
      );
      const preferences = notificationPreferencesResult.data?.notificationPreferencesForChannel;
      if (preferences) {
        this.notificationPreferences.set(preferences);
        this.notificationPreferencesAvailable.set(true);
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  private defaultTimeRange(): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  revenue(a: Record<string, unknown>): string {
    const v = a['totalRevenue'];
    return typeof v === 'number' ? v.toLocaleString() : String(v ?? 0);
  }
  orders(a: Record<string, unknown>): number {
    const v = a['totalOrders'];
    return typeof v === 'number' ? v : 0;
  }
  margin(a: Record<string, unknown>): string {
    const v = a['averageProfitMargin'];
    return typeof v === 'number' ? v.toFixed(1) : '0';
  }
  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  async toggleNotificationCategory(category: NotificationCategory): Promise<void> {
    const channelId = this.id();
    if (!channelId) return;
    const enabled = !this.notificationPreferences()[category];
    this.savingNotificationCategory.set(category);
    this.notificationPreferencesError.set(null);
    try {
      const result = await this.apollo.getClient().mutate<{
        updateNotificationPreferencesForChannel: ChannelNotificationPreferences;
      }>({
        mutation: UPDATE_NOTIFICATION_PREFERENCES_FOR_CHANNEL,
        variables: { channelId, input: { [category]: enabled } },
      });
      const preferences = result.data?.updateNotificationPreferencesForChannel;
      if (preferences) {
        this.notificationPreferences.set(preferences);
      }
    } catch (error) {
      this.notificationPreferencesError.set(error instanceof Error ? error.message : 'Failed to update notification settings');
    } finally {
      this.savingNotificationCategory.set(null);
    }
  }

  async updateStatus(): Promise<void> {
    const id = this.id();
    const status = this.newStatus();
    if (!id || !status) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_STATUS_PLATFORM,
        variables: { channelId: id, status },
      });
      const ch = this.channel();
      if (ch) this.channel.set({ ...ch, customFields: { ...ch.customFields, status } });
    } finally {
      this.saving.set(false);
    }
  }

  async extendTrial(): Promise<void> {
    const id = this.id();
    const dateStr = this.newTrialEndsAt();
    if (!id || !dateStr) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: EXTEND_TRIAL_PLATFORM,
        variables: { channelId: id, trialEndsAt: new Date(dateStr).toISOString() },
      });
      const ch = this.channel();
      if (ch)
        this.channel.set({
          ...ch,
          customFields: { ...ch.customFields, trialEndsAt: dateStr, subscriptionStatus: 'trial' },
        });
    } finally {
      this.saving.set(false);
    }
  }

  async updateSubscriptionStatus(): Promise<void> {
    const id = this.id();
    const status = this.newSubscriptionStatus();
    if (!id || !status) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_SUBSCRIPTION_PLATFORM,
        variables: { input: { channelId: id, subscriptionStatus: status } },
      });
      const ch = this.channel();
      if (ch)
        this.channel.set({
          ...ch,
          customFields: { ...ch.customFields, subscriptionStatus: status },
        });
    } finally {
      this.saving.set(false);
    }
  }

  async updateSubscriptionExpiry(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    try {
      const dateStr = this.newSubscriptionExpiresAt();
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_SUBSCRIPTION_PLATFORM,
        variables: {
          input: {
            channelId: id,
            subscriptionExpiresAt: dateStr ? new Date(dateStr).toISOString() : null,
          },
        },
      });
      const ch = this.channel();
      if (ch)
        this.channel.set({
          ...ch,
          customFields: { ...ch.customFields, subscriptionExpiresAt: dateStr || null },
        });
    } finally {
      this.saving.set(false);
    }
  }

  async updateSubscriptionExemption(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    try {
      const dateStr = this.newSubscriptionExemptUntil();
      const reason = this.newSubscriptionExemptReason().trim();
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_SUBSCRIPTION_PLATFORM,
        variables: {
          input: {
            channelId: id,
            subscriptionExemptUntil: dateStr ? new Date(dateStr).toISOString() : null,
            subscriptionExemptReason: reason || null,
          },
        },
      });
      const ch = this.channel();
      if (ch) {
        this.channel.set({
          ...ch,
          customFields: {
            ...ch.customFields,
            subscriptionExemptUntil: dateStr || null,
            subscriptionExemptReason: reason || null,
          },
        });
      }
    } finally {
      this.saving.set(false);
    }
  }

  async updateMaxAdminCount(): Promise<void> {
    const id = this.id();
    const value = Math.max(1, Number(this.newMaxAdminCount()) || 1);
    if (!id) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM,
        variables: { input: { channelId: id, maxAdminCount: value } },
      });
      const ch = this.channel();
      if (ch) this.channel.set({ ...ch, customFields: { ...ch.customFields, maxAdminCount: value } });
    } finally {
      this.saving.set(false);
    }
  }

  async updateZones(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_ZONES_PLATFORM,
        variables: {
          input: {
            channelId: id,
            defaultShippingZoneId: this.selectedShippingZoneId() || undefined,
            defaultTaxZoneId: this.selectedTaxZoneId() || undefined,
          },
        },
      });
      const ch = this.channel();
      const zones = this.zones();
      const shipId = this.selectedShippingZoneId();
      const taxId = this.selectedTaxZoneId();
      if (ch) {
        this.channel.set({
          ...ch,
          defaultShippingZone: shipId ? (zones.find(z => z.id === shipId) ?? ch.defaultShippingZone) : null,
          defaultTaxZone: taxId ? (zones.find(z => z.id === taxId) ?? ch.defaultTaxZone) : null,
        });
      }
    } finally {
      this.saving.set(false);
    }
  }

  async updateFeatureToggles(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM,
        variables: {
          input: {
            channelId: id,
            cashierFlowEnabled: this.cashierFlowEnabled(),
            cashControlEnabled: this.cashControlEnabled(),
            enablePrinter: this.enablePrinter(),
          },
        },
      });
      const ch = this.channel();
      if (ch) {
        this.channel.set({
          ...ch,
          customFields: {
            ...ch.customFields,
            cashierFlowEnabled: this.cashierFlowEnabled(),
            cashControlEnabled: this.cashControlEnabled(),
            enablePrinter: this.enablePrinter(),
          },
        });
      }
    } finally {
      this.saving.set(false);
    }
  }

  async updatePublicStorefront(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.saving.set(true);
    this.storefrontError.set(null);
    this.storefrontSaved.set(false);
    const slug = this.publicSlug().trim().toLowerCase() || null;
    const whatsapp = this.publicWhatsAppNumber().trim() || null;
    const enabled = this.publicStorefrontEnabled();
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CHANNEL_PUBLIC_STOREFRONT_PLATFORM,
        variables: {
          input: {
            channelId: id,
            publicSlug: slug,
            publicStorefrontEnabled: enabled,
            publicWhatsAppNumber: whatsapp,
          },
        },
      });
      // Reflect the server-normalised slug locally.
      this.publicSlug.set(slug ?? '');
      const ch = this.channel();
      if (ch) {
        this.channel.set({
          ...ch,
          customFields: {
            ...ch.customFields,
            publicStorefrontEnabled: enabled,
            publicSlug: slug,
            publicWhatsAppNumber: whatsapp,
          },
        });
      }
      this.storefrontSaved.set(true);
    } catch (err: any) {
      this.storefrontError.set(err?.message ?? 'Failed to save storefront settings.');
    } finally {
      this.saving.set(false);
    }
  }
}
