import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../../core/services/apollo.service';
import { PLATFORM_CHANNELS, PLATFORM_ADMINISTRATORS } from '../../../core/graphql/operations';

interface PlatformAdministratorItem {
  id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userId: string;
  identifier: string;
  authorizationStatus: string;
  roleCodes: string[];
  channelIds?: string[] | null;
  isSuperAdmin?: boolean | null;
}

interface PlatformChannelBasic {
  id: string;
  code: string;
}

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.scss',
})
export class UsersListComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  items = signal<PlatformAdministratorItem[]>([]);
  totalItems = signal(0);
  channels = signal<PlatformChannelBasic[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  filterChannelId = signal<string>('');
  filterSuperAdminOnly = signal(false);
  skip = signal(0);
  take = 50;

  async ngOnInit(): Promise<void> {
    const client = this.apollo.getClient();
    try {
      const [chResult, adminsResult] = await Promise.all([
        client.query<{ platformChannels: PlatformChannelBasic[] }>({
          query: PLATFORM_CHANNELS,
          fetchPolicy: 'network-only',
        }),
        this.loadAdmins(),
      ]);
      this.channels.set(
        (chResult.data?.platformChannels ?? []).map((c) => ({ id: c.id, code: c.code }))
      );
      const data = adminsResult.data?.platformAdministrators;
      this.items.set(data?.items ?? []);
      this.totalItems.set(data?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      this.loading.set(false);
    }
  }

  private loadAdmins(): Promise<{ data?: { platformAdministrators: { items: PlatformAdministratorItem[]; totalItems: number } } }> {
    const client = this.apollo.getClient();
    const channelId = this.filterChannelId() || undefined;
    const superAdminOnly = this.filterSuperAdminOnly();
    return client.query<{
      platformAdministrators: { items: PlatformAdministratorItem[]; totalItems: number };
    }>({
      query: PLATFORM_ADMINISTRATORS,
      variables: {
        options: {
          skip: this.skip(),
          take: this.take,
          channelId: channelId || null,
          superAdminOnly: superAdminOnly || null,
        },
      },
      fetchPolicy: 'network-only',
    });
  }

  async applyFilters(): Promise<void> {
    this.loading.set(true);
    this.skip.set(0);
    try {
      const result = await this.loadAdmins();
      const data = result.data?.platformAdministrators;
      this.items.set(data?.items ?? []);
      this.totalItems.set(data?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  channelsLabel(admin: PlatformAdministratorItem): string {
    if (admin.isSuperAdmin) return 'Global';
    const ids = admin.channelIds ?? [];
    if (ids.length === 0) return '—';
    return ids.length === 1 ? ids[0] : `${ids.length} channels`;
  }

  channelCode(id: string): string {
    return this.channels().find((c) => c.id === id)?.code ?? id;
  }
}
