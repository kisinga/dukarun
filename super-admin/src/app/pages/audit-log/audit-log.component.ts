import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import gql from 'graphql-tag';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';

const PLATFORM_AUDIT_LOGS = gql`
  query PlatformAuditLogs($options: PlatformAuditLogOptions) {
    platformAuditLogs(options: $options) {
      id
      timestamp
      eventType
      entityType
      entityId
      userId
      ipAddress
      data
      source
    }
  }
`;

const PAGE_SIZE = 50;

export interface PlatformAuditLogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  ipAddress: string | null;
  data: Record<string, unknown>;
  source: string;
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  logs = signal<PlatformAuditLogEntry[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  skip = signal(0);
  hasMore = signal(true);
  loadingMore = signal(false);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.skip.set(0);
    try {
      const result = await this.apollo.getClient().query<{
        platformAuditLogs: PlatformAuditLogEntry[];
      }>({
        query: PLATFORM_AUDIT_LOGS,
        variables: { options: { limit: PAGE_SIZE, skip: 0 } },
        fetchPolicy: 'network-only',
      });
      const list = result.data?.platformAuditLogs ?? [];
      this.logs.set(list);
      this.hasMore.set(list.length === PAGE_SIZE);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load audit log'
      );
      this.logs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const currentSkip = this.skip() + PAGE_SIZE;
    this.loadingMore.set(true);
    try {
      const result = await this.apollo.getClient().query<{
        platformAuditLogs: PlatformAuditLogEntry[];
      }>({
        query: PLATFORM_AUDIT_LOGS,
        variables: { options: { limit: PAGE_SIZE, skip: currentSkip } },
        fetchPolicy: 'network-only',
      });
      const list = result.data?.platformAuditLogs ?? [];
      this.logs.update(prev => [...prev, ...list]);
      this.skip.set(currentSkip);
      this.hasMore.set(list.length === PAGE_SIZE);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load more'
      );
    } finally {
      this.loadingMore.set(false);
    }
  }

  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  formatData(data: Record<string, unknown> | null): string {
    if (!data || Object.keys(data).length === 0) return '—';
    try {
      const str = JSON.stringify(data);
      return str.length > 80 ? str.slice(0, 80) + '…' : str;
    } catch {
      return '—';
    }
  }
}
