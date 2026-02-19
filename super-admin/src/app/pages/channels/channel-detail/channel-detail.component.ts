import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../../core/services/apollo.service';
import {
  PLATFORM_CHANNELS,
  ANALYTICS_STATS_FOR_CHANNEL,
  AUDIT_LOGS_FOR_CHANNEL,
  ADMINISTRATORS_FOR_CHANNEL,
  NOTIFICATIONS_FOR_CHANNEL,
  UPDATE_CHANNEL_STATUS_PLATFORM,
  EXTEND_TRIAL_PLATFORM,
  UPDATE_CHANNEL_FEATURE_FLAGS_PLATFORM,
} from '../../../core/graphql/operations';

interface PlatformChannel {
  id: string;
  code: string;
  token: string;
  customFields: {
    status: string;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    maxAdminCount: number;
    cashierFlowEnabled: boolean;
    cashControlEnabled: boolean;
    enablePrinter: boolean;
  };
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

@Component({
  selector: 'app-channel-detail',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './channel-detail.component.html',
  styleUrl: './channel-detail.component.scss',
})
export class ChannelDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly apollo = inject(ApolloService);

  channel = signal<PlatformChannel | null>(null);
  analytics = signal<Record<string, unknown> | null>(null);
  auditLogs = signal<any[]>([]);
  admins = signal<PlatformAdministrator[]>([]);
  notifications = signal<ChannelNotification[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  statusOptions = ['UNAPPROVED', 'APPROVED', 'DISABLED', 'BANNED'];
  newStatus = signal('');
  newTrialEndsAt = signal('');
  saving = signal(false);

  id = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const client = this.apollo.getClient();
    try {
      const [chResult, analyticsResult, auditResult, adminsResult, notificationsResult] = await Promise.all([
        client.query<{ platformChannels: PlatformChannel[] }>({ query: PLATFORM_CHANNELS, fetchPolicy: 'network-only' }),
        client.query({
          query: ANALYTICS_STATS_FOR_CHANNEL,
          variables: {
            channelId: id,
            timeRange: this.defaultTimeRange(),
            limit: 10,
          },
          fetchPolicy: 'network-only',
        }).catch(() => ({ data: null })),
        client.query({
          query: AUDIT_LOGS_FOR_CHANNEL,
          variables: { channelId: id, options: { limit: 20 } },
          fetchPolicy: 'network-only',
        }).catch(() => ({ data: { auditLogsForChannel: [] } })),
        client.query<{ administratorsForChannel: PlatformAdministrator[] }>({
          query: ADMINISTRATORS_FOR_CHANNEL,
          variables: { channelId: id },
          fetchPolicy: 'network-only',
        }).catch(() => ({ data: { administratorsForChannel: [] } })),
        client.query<{ notificationsForChannel: { items: ChannelNotification[] } }>({
          query: NOTIFICATIONS_FOR_CHANNEL,
          variables: { channelId: id, options: { take: 50 } },
          fetchPolicy: 'network-only',
        }).catch(() => ({ data: { notificationsForChannel: { items: [] } } })),
      ]);
      const ch = chResult.data?.platformChannels?.find((c: PlatformChannel) => c.id === id) ?? null;
      this.channel.set(ch);
      if (ch) {
        this.newStatus.set(ch.customFields.status);
        if (ch.customFields.trialEndsAt) {
          this.newTrialEndsAt.set(ch.customFields.trialEndsAt.toString().slice(0, 10));
        }
      }
      this.analytics.set((analyticsResult.data as any)?.analyticsStatsForChannel ?? null);
      this.auditLogs.set((auditResult.data as any)?.auditLogsForChannel ?? []);
      this.admins.set(adminsResult.data?.administratorsForChannel ?? []);
      this.notifications.set(
        (notificationsResult.data as { notificationsForChannel?: { items: ChannelNotification[] } })?.notificationsForChannel?.items ?? []
      );
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
      if (ch) this.channel.set({ ...ch, customFields: { ...ch.customFields, trialEndsAt: dateStr } });
    } finally {
      this.saving.set(false);
    }
  }
}
