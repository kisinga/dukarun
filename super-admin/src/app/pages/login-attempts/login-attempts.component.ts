import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import { ADMIN_LOGIN_ATTEMPTS } from '../../core/graphql/operations.graphql';

export interface AdminLoginAttempt {
  id: string;
  eventKind: string;
  timestamp: string;
  ipAddress: string | null;
  username: string;
  success: boolean;
  failureReason: string | null;
  userId: number | null;
  authMethod: string;
  userAgent: string | null;
  isSuperAdmin: boolean | null;
}

@Component({
  selector: 'app-login-attempts',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './login-attempts.component.html',
  styleUrl: './login-attempts.component.scss',
})
export class LoginAttemptsComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  attempts = signal<AdminLoginAttempt[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  since = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const sinceVal = this.since();
      const sinceDate = sinceVal ? new Date(sinceVal + 'T00:00:00') : undefined;
      const result = await this.apollo.getClient().query<{
        adminLoginAttempts: AdminLoginAttempt[];
      }>({
        query: ADMIN_LOGIN_ATTEMPTS,
        variables: { limit: 100, skip: 0, since: sinceDate },
        fetchPolicy: 'network-only',
      });
      this.attempts.set(result.data?.adminLoginAttempts ?? []);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load login attempts');
    } finally {
      this.loading.set(false);
    }
  }

  setSince(value: string): void {
    this.since.set(value || null);
  }

  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  isRateLimitRow(a: AdminLoginAttempt): boolean {
    return a.eventKind === 'otp_rate_limited';
  }
}
