import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header';
import { ApolloService } from '../../../core/services/apollo.service';
import { PLATFORM_CHANNELS } from '../../../core/graphql/operations.graphql';

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
    smsUsedThisPeriod?: number;
    smsPeriodEnd?: string | null;
    smsLimitFromTier?: number | null;
  };
}

@Component({
  selector: 'app-channels-list',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent],
  templateUrl: './channels-list.component.html',
  styleUrl: './channels-list.component.scss',
})
export class ChannelsListComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  channels = signal<PlatformChannel[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const client = this.apollo.getClient();
    try {
      const result = await client.query<{ platformChannels: PlatformChannel[] }>({
        query: PLATFORM_CHANNELS,
        fetchPolicy: 'network-only',
      });
      this.channels.set(result.data?.platformChannels ?? []);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load channels');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }
}
