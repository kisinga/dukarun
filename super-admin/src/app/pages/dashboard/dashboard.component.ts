import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import {
  PLATFORM_STATS,
  PLATFORM_MONITORING,
  PLATFORM_CHANNELS,
  PENDING_REGISTRATIONS,
  PLATFORM_ADMINISTRATORS,
  ROLE_TEMPLATES,
  GET_SUBSCRIPTION_TIERS,
} from '../../core/graphql/operations.graphql';
import type { PlatformMonitoringQuery } from '../../core/graphql/generated/graphql';

interface PlatformStats {
  totalChannels: number;
  channelsByStatus: { UNAPPROVED: number; APPROVED: number; DISABLED: number; BANNED: number };
  trialExpiringSoonCount: number;
  activeSubscriptionsCount: number;
}

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

const TRIAL_EXPIRING_DAYS = 7;
const CHANNELS_NEEDING_ATTENTION_LIMIT = 10;

function channelsNeedingAttention(channels: PlatformChannel[]): PlatformChannel[] {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + TRIAL_EXPIRING_DAYS);

  return channels
    .filter((ch) => {
      if (ch.customFields.status === 'UNAPPROVED') return true;
      const trialEnd = ch.customFields.trialEndsAt ? new Date(ch.customFields.trialEndsAt) : null;
      return trialEnd != null && trialEnd > now && trialEnd <= cutoff;
    })
    .slice(0, CHANNELS_NEEDING_ATTENTION_LIMIT);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly apollo = inject(ApolloService);
  private readonly router = inject(Router);

  stats = signal<PlatformStats | null>(null);
  pendingCount = signal<number>(0);
  adminsCount = signal<number>(0);
  roleTemplatesCount = signal<number>(0);
  subscriptionTiersCount = signal<number>(0);
  channelsNeedingAttention = signal<PlatformChannel[]>([]);
  monitoring = signal<PlatformMonitoringQuery['platformMonitoring'] | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  hasData = computed(() => this.stats() != null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const client = this.apollo.getClient();

    try {
      const [
        statsResult,
        monitoringResult,
        pendingResult,
        adminsResult,
        roleTemplatesResult,
        tiersResult,
        channelsResult,
      ] = await Promise.all([
        client.query<{ platformStats: PlatformStats }>({ query: PLATFORM_STATS, fetchPolicy: 'network-only' }),
        client.query<PlatformMonitoringQuery>({ query: PLATFORM_MONITORING, fetchPolicy: 'network-only' }),
        client.query<{ pendingRegistrations: unknown[] }>({ query: PENDING_REGISTRATIONS, fetchPolicy: 'network-only' }),
        client.query<{ platformAdministrators: { totalItems: number } }>({
          query: PLATFORM_ADMINISTRATORS,
          variables: { options: { take: 1 } },
          fetchPolicy: 'network-only',
        }),
        client.query<{ platformRoleTemplates: unknown[] }>({ query: ROLE_TEMPLATES, fetchPolicy: 'network-only' }),
        client.query<{ getSubscriptionTiers: unknown[] }>({ query: GET_SUBSCRIPTION_TIERS, fetchPolicy: 'network-only' }),
        client.query<{ platformChannels: PlatformChannel[] }>({ query: PLATFORM_CHANNELS, fetchPolicy: 'network-only' }),
      ]);

      this.stats.set(statsResult.data?.platformStats ?? null);
      this.monitoring.set(monitoringResult.data?.platformMonitoring ?? null);
      this.pendingCount.set(pendingResult.data?.pendingRegistrations?.length ?? 0);
      this.adminsCount.set(adminsResult.data?.platformAdministrators?.totalItems ?? 0);
      this.roleTemplatesCount.set(roleTemplatesResult.data?.platformRoleTemplates?.length ?? 0);
      this.subscriptionTiersCount.set(tiersResult.data?.getSubscriptionTiers?.length ?? 0);
      const channels = channelsResult.data?.platformChannels ?? [];
      this.channelsNeedingAttention.set(channelsNeedingAttention(channels));
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  formatTrialEnd(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  navigateToChannel(channelId: string): void {
    this.router.navigate(['/channels', channelId]);
  }

  /** Format uptime seconds as e.g. "2d 5h" or "45m". */
  formatUptime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainderHours = hours % 24;
    return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
  }
}
