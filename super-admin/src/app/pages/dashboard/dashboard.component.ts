import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApolloService } from '../../core/services/apollo.service';
import { PLATFORM_STATS } from '../../core/graphql/operations';

interface PlatformStats {
  totalChannels: number;
  channelsByStatus: { UNAPPROVED: number; APPROVED: number; DISABLED: number; BANNED: number };
  trialExpiringSoonCount: number;
  activeSubscriptionsCount: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  stats = signal<PlatformStats | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const client = this.apollo.getClient();
    try {
      const result = await client.query<{ platformStats: PlatformStats }>({
        query: PLATFORM_STATS,
        fetchPolicy: 'network-only',
      });
      this.stats.set(result.data?.platformStats ?? null);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load stats');
    } finally {
      this.loading.set(false);
    }
  }
}
