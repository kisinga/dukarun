import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../core/services/apollo.service';
import {
  PENDING_REGISTRATIONS,
  APPROVE_USER,
  REJECT_USER,
} from '../../core/graphql/operations.graphql';
import { PageHeaderComponent } from '../../shared/components/page-header';

interface PendingRegistration {
  userId: string;
  identifier: string;
  createdAt: string;
  administrator: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
  };
}

@Component({
  selector: 'app-pending-registrations',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './pending-registrations.component.html',
  styleUrl: './pending-registrations.component.scss',
})
export class PendingRegistrationsComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  items = signal<PendingRegistration[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  actionLoading = signal<string | null>(null);
  rejectUserId = signal<string | null>(null);
  rejectReason = signal('');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.apollo.getClient().query<{ pendingRegistrations: PendingRegistration[] }>({
        query: PENDING_REGISTRATIONS,
        fetchPolicy: 'network-only',
      });
      this.items.set(result.data?.pendingRegistrations ?? []);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  async approve(userId: string): Promise<void> {
    this.actionLoading.set(userId);
    try {
      await this.apollo.getClient().mutate({
        mutation: APPROVE_USER,
        variables: { userId },
      });
      this.items.update((list) => list.filter((r) => r.userId !== userId));
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      this.actionLoading.set(null);
    }
  }

  openReject(userId: string): void {
    this.rejectUserId.set(userId);
    this.rejectReason.set('');
  }

  cancelReject(): void {
    this.rejectUserId.set(null);
    this.rejectReason.set('');
  }

  async confirmReject(): Promise<void> {
    const userId = this.rejectUserId();
    if (!userId) return;
    this.actionLoading.set(userId);
    try {
      await this.apollo.getClient().mutate({
        mutation: REJECT_USER,
        variables: { userId, reason: this.rejectReason() || null },
      });
      this.items.update((list) => list.filter((r) => r.userId !== userId));
      this.cancelReject();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      this.actionLoading.set(null);
    }
  }

  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  fullName(reg: PendingRegistration): string {
    const a = reg.administrator;
    return [a.firstName, a.lastName].filter(Boolean).join(' ') || '—';
  }
}
