import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { NotificationsService, OutboxMessage } from '../notifications/notifications.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { StatBarComponent } from '../shared/ui/stat-bar.component';

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  sent: 'success',
  failed: 'error',
  cancelled: 'neutral',
};

const MESSAGE_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'queued', label: 'Queued date' },
  { value: 'recipient', label: 'Recipient' },
  { value: 'channel', label: 'Channel' },
  { value: 'status', label: 'Delivery status' },
];

@Component({
  selector: 'app-messaging',
  imports: [
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
      title="Customer communications"
      subtitle="Monitor approved transactional SMS and WhatsApp delivery."
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh delivery history"
        aria-label="Refresh delivery history"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }

      <div class="alert mb-4 border border-info/20 bg-info/10 text-sm" role="status">
        <app-icon name="heroInformationCircle" />
        <span>
          Message wording and recipients are controlled by Dukarun transactional actions. General
          customer broadcasts are unavailable.
        </span>
      </div>

      @if (usage(); as currentUsage) {
        <div
          class="mb-4 grid gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-sm sm:grid-cols-2"
        >
          @for (entry of quotaRows(currentUsage); track entry.label) {
            <div>
              <span class="type-caption">{{ entry.label }} this period</span>
              <p class="font-semibold tabular-nums">
                {{ entry.used }} used · {{ entry.reserved }} reserved
                @if (entry.limit !== null) {
                  · {{ entry.remaining }} remaining
                }
              </p>
            </div>
          }
        </div>
      }

      <app-list-search-bar
        placeholder="Search recipient or message…"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); outboxPage.set(1)"
        [sortOptions]="messageSortOptions"
        [sortKey]="messageSort()"
        (sortKeyChange)="messageSort.set($event); outboxPage.set(1)"
        [sortDirection]="messageSortDirection()"
        (sortDirectionChange)="messageSortDirection.set($event); outboxPage.set(1)"
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
              <option value="cancelled">Cancelled</option>
            </select>
          </app-form-field>
        </div>
      </app-list-search-bar>

      @if (!loading() && filteredOutbox().length === 0) {
        <app-empty-state
          [compact]="hasOutboxFilters()"
          icon="heroBellSlash"
          [title]="hasOutboxFilters() ? 'No matching deliveries' : 'No delivery history yet'"
          [description]="
            hasOutboxFilters()
              ? 'Try another recipient, message, channel, or status.'
              : 'Approved transactional messages will appear here when they are queued.'
          "
        />
      } @else {
        <div class="hidden lg:block">
          <app-data-table-shell
            title="Delivery history"
            [description]="filteredOutbox().length + ' matching deliveries'"
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
                @for (message of pagedOutbox(); track message.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ time(message.created_at) }}</td>
                    <td class="uppercase">{{ message.channel }}</td>
                    <td class="font-mono text-xs">{{ message.recipient }}</td>
                    <td class="max-w-lg">
                      <p class="line-clamp-2 text-sm">{{ message.body }}</p>
                    </td>
                    <td>
                      <app-status-badge
                        [type]="statusType(message.status)"
                        [label]="message.status"
                        size="xs"
                      />
                      @if (message.status === 'failed' && message.error) {
                        <p class="table-secondary max-w-xs text-error">{{ message.error }}</p>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="flex flex-col gap-2 lg:hidden">
          @for (message of pagedOutbox(); track message.id) {
            <div class="card bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-xs font-semibold uppercase">{{ message.channel }}</span>
                      <app-status-badge
                        [type]="statusType(message.status)"
                        [label]="message.status"
                        size="xs"
                      />
                    </div>
                    <p class="mt-1 font-mono text-xs text-base-content/60">
                      {{ message.recipient }}
                    </p>
                  </div>
                  <span class="type-caption shrink-0">{{ time(message.created_at) }}</span>
                </div>
                <p class="border-t border-base-300/60 pt-3 text-sm">{{ message.body }}</p>
                @if (message.status === 'failed' && message.error) {
                  <p class="text-xs text-error">{{ message.error }}</p>
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
            itemLabel="deliveries"
            [showItemsPerPage]="true"
            (pageChange)="outboxPage.set($event)"
            (itemsPerPageChange)="outboxPageSize.set($event); outboxPage.set(1)"
          />
        </div>
      }
    </app-page>
  `,
})
export class CommunicationsComponent implements OnInit {
  private readonly notifications = inject(NotificationsService);

  protected readonly usage = signal<{
    sms: { used: number; reserved: number; limit: number | null };
    whatsapp: { used: number; reserved: number; limit: number | null };
  } | null>(null);
  protected readonly outbox = signal<OutboxMessage[]>([]);
  protected readonly loading = signal(false);
  protected readonly query = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly statusFilter = signal('all');
  protected readonly messageSortOptions = MESSAGE_SORT_OPTIONS;
  protected readonly messageSort = signal('queued');
  protected readonly messageSortDirection = signal<ListSortDirection>('desc');
  protected readonly outboxPage = signal(1);
  protected readonly outboxPageSize = signal(10);
  protected readonly error = signal<string | null>(null);

  protected readonly filteredOutbox = computed(() => {
    const query = this.query().trim().toLowerCase();
    const rows = this.outbox().filter(message => {
      if (this.channelFilter() !== 'all' && message.channel !== this.channelFilter()) return false;
      if (this.statusFilter() !== 'all' && message.status !== this.statusFilter()) return false;
      if (!query) return true;
      return [message.recipient, message.body, message.channel, message.status]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    const sortKey = this.messageSort();
    return sortList(
      rows,
      this.messageSortDirection(),
      message => {
        switch (sortKey) {
          case 'recipient':
            return message.recipient;
          case 'channel':
            return message.channel;
          case 'status':
            return message.status;
          default:
            return message.created_at;
        }
      },
      message => message.created_at
    );
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
      { label: 'Recent deliveries', value: rows.length },
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
        this.notifications.communicationUsage(),
        this.notifications.recentOutbox(100),
      ]);
      this.usage.set(usage);
      this.outbox.set(outbox);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load communications');
    } finally {
      this.loading.set(false);
    }
  }

  protected quotaRows(usage: {
    sms: { used: number; reserved: number; limit: number | null };
    whatsapp: { used: number; reserved: number; limit: number | null };
  }): Array<{
    label: string;
    used: number;
    reserved: number;
    limit: number | null;
    remaining: number | null;
  }> {
    return (['sms', 'whatsapp'] as const).map(channel => ({
      label: channel === 'sms' ? 'SMS' : 'WhatsApp',
      ...usage[channel],
      remaining:
        usage[channel].limit === null
          ? null
          : Math.max(usage[channel].limit - usage[channel].used - usage[channel].reserved, 0),
    }));
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
