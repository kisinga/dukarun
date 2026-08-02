import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { NotificationsService, OutboxMessage } from '../notifications/notifications.service';

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  sent: 'success',
  failed: 'error',
};

@Component({
  selector: 'app-messaging',
  imports: [ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-3xl">
        <app-page-header title="Messaging" backLink="/dashboard" backLabel="Dashboard" />

        <!-- Compose -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h2 class="card-title text-lg">Batch message</h2>
            <form (submit)="$event.preventDefault(); send()" class="mt-2 flex flex-col gap-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="form-control">
                  <span class="label-text">Audience</span>
                  <select class="select select-bordered select-sm" [formControl]="audience">
                    <option value="all">All customers</option>
                    <option value="credit_overdue">Customers with overdue credit</option>
                  </select>
                </label>
                <label class="form-control">
                  <span class="label-text">Channel</span>
                  <select class="select select-bordered select-sm" [formControl]="channel">
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                  @if (channel.value === 'whatsapp') {
                    <span class="label-text-alt text-base-content/60">
                      WhatsApp delivers 08:00–19:00 EAT.
                    </span>
                  }
                </label>
              </div>

              <label class="form-control">
                <span class="label-text">Message</span>
                <textarea
                  class="textarea textarea-bordered w-full"
                  rows="3"
                  placeholder="e.g. Karibu! We close at 8pm today."
                  maxlength="480"
                  [formControl]="body"
                ></textarea>
                <span class="label-text-alt text-base-content/60">
                  {{ body.value.length }}/480
                </span>
              </label>

              <!-- SMS usage meter -->
              @if (usage(); as u) {
                <div class="flex items-center gap-2 text-sm">
                  <span class="type-caption">SMS this period</span>
                  <span
                    class="font-semibold tabular-nums"
                    [class.text-warning]="nearCap()"
                    [class.text-error]="u.limit !== null && u.used >= u.limit"
                  >
                    {{ u.used }}{{ u.limit !== null ? ' / ' + u.limit : '' }}
                  </span>
                  @if (nearCap()) {
                    <span class="type-caption text-warning">near the monthly cap</span>
                  }
                </div>
              }

              @if (error()) {
                <p class="text-sm text-error">{{ error() }}</p>
              }
              @if (notice()) {
                <p class="text-sm text-success">{{ notice() }}</p>
              }
              <button
                type="submit"
                class="btn btn-primary min-h-11 self-start"
                [disabled]="busy() || body.value.trim().length === 0"
              >
                {{ busy() ? 'Queueing…' : 'Queue message' }}
              </button>
            </form>
          </div>
        </div>

        <!-- Recent outbox -->
        <h2 class="type-heading mb-2">Recent messages</h2>
        @if (outbox().length === 0) {
          <app-empty-state
            icon="heroBellSlash"
            title="Nothing sent yet"
            description="Queued SMS and WhatsApp messages appear here with their delivery status."
          />
        } @else {
          <div class="card bg-base-100">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (m of outbox(); track m.id) {
                  <tr>
                    <td class="text-xs">{{ m.channel }}</td>
                    <td class="font-mono text-xs">{{ m.recipient }}</td>
                    <td class="max-w-48 truncate text-sm">{{ m.body }}</td>
                    <td>
                      <app-status-badge
                        [type]="statusType(m.status)"
                        [label]="m.status"
                        size="xs"
                      />
                      @if (m.status === 'failed' && m.error) {
                        <div class="type-caption text-error">{{ m.error }}</div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </main>
  `,
})
export class MessagingComponent implements OnInit {
  private readonly notifications = inject(NotificationsService);

  protected readonly audience = new FormControl<'all' | 'credit_overdue'>('all', {
    nonNullable: true,
  });
  protected readonly channel = new FormControl<'sms' | 'whatsapp'>('sms', { nonNullable: true });
  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly usage = signal<{ used: number; limit: number | null } | null>(null);
  protected readonly outbox = signal<OutboxMessage[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly nearCap = computed(() => {
    const u = this.usage();
    return !!u && u.limit !== null && u.used >= u.limit * 0.8 && u.used < u.limit;
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [usage, outbox] = await Promise.all([
        this.notifications.smsUsage(),
        this.notifications.recentOutbox(),
      ]);
      this.usage.set(usage);
      this.outbox.set(outbox);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  protected async send(): Promise<void> {
    const text = this.body.value.trim();
    if (!text) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const count = await this.notifications.queueBatchMessage(
        this.channel.value,
        text,
        this.audience.value
      );
      // sms_limit_reached surfaces verbatim from the backend on failure.
      this.notice.set(`Queued for ${count} customer(s)`);
      this.body.setValue('');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Queue failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected statusType(status: string): 'success' | 'warning' | 'error' | 'neutral' {
    return STATUS_TYPE[status] ?? 'neutral';
  }
}
