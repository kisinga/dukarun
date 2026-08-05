import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { NotificationsService, OutboxMessage } from '../notifications/notifications.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  sent: 'success',
  failed: 'error',
};

@Component({
  selector: 'app-messaging',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    PaginationComponent,
    ButtonComponent,
    DataTableShellComponent,
    FormFieldComponent,
    IconComponent,
    ListSearchBarComponent,
    StatBarComponent,
  ],
  template: `
    <app-page
      title="Messaging"
      subtitle="Send customer updates and monitor SMS or WhatsApp delivery."
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh messages"
        aria-label="Refresh messages"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>
      <button actions appButton type="button" (click)="composerOpen.set(true)">
        <app-icon name="heroPlus" /> Compose message
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <!-- Compose -->
      @if (composerOpen()) {
        <div class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="section-title">Compose message</h2>
                <p class="type-caption mt-1">
                  Queue one message for a customer audience. Delivery status appears below.
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                aria-label="Close message composer"
                (click)="composerOpen.set(false)"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>
            <form (submit)="$event.preventDefault(); send()" class="mt-3 flex flex-col gap-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <app-form-field label="Audience" [required]="true">
                  <select class="select select-bordered select-sm w-full" [formControl]="audience">
                    <option value="all">All customers</option>
                    <option value="credit_overdue">Customers with overdue credit</option>
                  </select>
                </app-form-field>
                <app-form-field
                  label="Channel"
                  [required]="true"
                  [hint]="channel.value === 'whatsapp' ? 'WhatsApp delivers 08:00–19:00 EAT.' : ''"
                >
                  <select class="select select-bordered select-sm w-full" [formControl]="channel">
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </app-form-field>
              </div>

              <app-form-field
                label="Message"
                [required]="true"
                [hint]="body.value.length + '/480 characters'"
              >
                <textarea
                  class="textarea textarea-bordered w-full"
                  rows="3"
                  placeholder="e.g. Karibu! We close at 8pm today."
                  maxlength="480"
                  [formControl]="body"
                ></textarea>
              </app-form-field>

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

              <button
                appButton
                type="submit"
                class="self-start"
                [loading]="busy()"
                [disabled]="busy() || body.value.trim().length === 0"
              >
                <app-icon name="heroChatBubbleLeftRight" /> Queue message
              </button>
            </form>
          </div>
        </div>
      }

      <!-- Recent outbox -->
      <app-list-search-bar
        placeholder="Search recipient or message…"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); outboxPage.set(1)"
      >
        <app-stat-bar summary [stats]="messageStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
          <app-form-field label="Channel" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="channelFilter()"
              (change)="setFilter('channel', $event)"
            >
              <option value="all">All channels</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </app-form-field>
          <app-form-field label="Status" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="statusFilter()"
              (change)="setFilter('status', $event)"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </app-form-field>
        </div>
      </app-list-search-bar>

      @if (!loading() && filteredOutbox().length === 0) {
        <app-empty-state
          [compact]="query().length > 0 || channelFilter() !== 'all' || statusFilter() !== 'all'"
          icon="heroBellSlash"
          [title]="hasOutboxFilters() ? 'No matching messages' : 'Nothing sent yet'"
          [description]="
            hasOutboxFilters()
              ? 'Try another recipient, message, channel, or status.'
              : 'Queued SMS and WhatsApp messages appear here with their delivery status.'
          "
        />
      } @else {
        <div class="hidden lg:block">
          <app-data-table-shell
            title="Delivery history"
            [description]="filteredOutbox().length + ' matching messages'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Queued</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (m of pagedOutbox(); track m.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ time(m.created_at) }}</td>
                    <td class="uppercase">{{ m.channel }}</td>
                    <td class="font-mono text-xs">{{ m.recipient }}</td>
                    <td class="max-w-lg">
                      <p class="line-clamp-2 text-sm">{{ m.body }}</p>
                    </td>
                    <td>
                      <app-status-badge
                        [type]="statusType(m.status)"
                        [label]="m.status"
                        size="xs"
                      />
                      @if (m.status === 'failed' && m.error) {
                        <p class="table-secondary max-w-xs text-error">{{ m.error }}</p>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="flex flex-col gap-2 lg:hidden">
          @for (m of pagedOutbox(); track m.id) {
            <div class="card bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-xs font-semibold uppercase">{{ m.channel }}</span>
                      <app-status-badge
                        [type]="statusType(m.status)"
                        [label]="m.status"
                        size="xs"
                      />
                    </div>
                    <p class="mt-1 font-mono text-xs text-base-content/60">{{ m.recipient }}</p>
                  </div>
                  <span class="type-caption shrink-0">{{ time(m.created_at) }}</span>
                </div>
                <p class="border-t border-base-300/60 pt-3 text-sm">{{ m.body }}</p>
                @if (m.status === 'failed' && m.error) {
                  <p class="text-xs text-error">{{ m.error }}</p>
                }
              </div>
            </div>
          }
        </div>

        <div class="mt-3">
          <app-pagination
            [currentPage]="outboxPage()"
            [totalPages]="outboxTotalPages()"
            [totalItems]="filteredOutbox().length"
            [itemsPerPage]="outboxPageSize()"
            itemLabel="messages"
            [showItemsPerPage]="true"
            (pageChange)="outboxPage.set($event)"
            (itemsPerPageChange)="outboxPageSize.set($event); outboxPage.set(1)"
          />
        </div>
      }
    </app-page>
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
  protected readonly composerOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly query = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly statusFilter = signal('all');
  protected readonly outboxPage = signal(1);
  protected readonly outboxPageSize = signal(10);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly nearCap = computed(() => {
    const u = this.usage();
    return !!u && u.limit !== null && u.used >= u.limit * 0.8 && u.used < u.limit;
  });
  protected readonly filteredOutbox = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.outbox().filter(message => {
      if (this.channelFilter() !== 'all' && message.channel !== this.channelFilter()) return false;
      if (this.statusFilter() !== 'all' && message.status !== this.statusFilter()) return false;
      if (!query) return true;
      return [message.recipient, message.body, message.channel, message.status]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  });
  protected readonly hasOutboxFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.channelFilter() !== 'all' ||
      this.statusFilter() !== 'all'
  );
  protected readonly messageStats = computed(() => {
    const rows = this.outbox();
    return [
      { label: 'Recent messages', value: rows.length },
      {
        label: 'Pending',
        value: rows.filter(message => message.status === 'pending').length,
        tone: 'warning' as const,
      },
      {
        label: 'Sent',
        value: rows.filter(message => message.status === 'sent').length,
        tone: 'success' as const,
      },
      {
        label: 'Failed',
        value: rows.filter(message => message.status === 'failed').length,
        tone: 'error' as const,
      },
    ];
  });
  protected readonly outboxTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredOutbox().length / this.outboxPageSize()))
  );
  protected readonly pagedOutbox = computed(() => {
    const page = Math.min(this.outboxPage(), this.outboxTotalPages());
    const start = (page - 1) * this.outboxPageSize();
    return this.filteredOutbox().slice(start, start + this.outboxPageSize());
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
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
    } finally {
      this.loading.set(false);
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
      this.composerOpen.set(false);
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

  protected setFilter(kind: 'channel' | 'status', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'channel') this.channelFilter.set(value);
    else this.statusFilter.set(value);
    this.outboxPage.set(1);
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
