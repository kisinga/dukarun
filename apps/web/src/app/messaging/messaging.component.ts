import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import {
  NotificationsService,
  OutboxMessageWithParty,
} from '../notifications/notifications.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { PartyCacheService } from '../core/party-cache.service';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { WorkspaceNavigationComponent } from '../shared/ui/workspace-navigation.component';

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

// Keeps PostgREST URLs bounded for broad party-name searches. Recipient/body
// matching remains server-side and exhaustive; party-name expansion is best-effort.
const RELATED_PARTY_SEARCH_ID_LIMIT = 50;

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
    RouterLink,
    SearchableFilterComponent,
    MobileListComponent,
    PageActionsComponent,
    WorkspaceNavigationComponent,
  ],
  template: `
    <app-page
      title="Activity"
      subtitle="Monitor approved transactional SMS and WhatsApp delivery."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
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
      </app-page-actions>

      <app-workspace-navigation workspace="activity" label="Activity" />

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
        placeholder="Search customer, recipient, or message…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
        [sortOptions]="messageSortOptions"
        [sortKey]="messageSort()"
        (sortKeyChange)="messageSort.set($event); reloadFromStart()"
        [sortDirection]="messageSortDirection()"
        (sortDirectionChange)="messageSortDirection.set($event); reloadFromStart()"
        [filtersEnabled]="true"
        [activeFilterCount]="messageFilterCount()"
        (clearFilters)="clearMessageFilters()"
      >
        <app-stat-bar summary [stats]="messageStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
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
          <app-form-field label="Related party" class="lg:w-52">
            <app-searchable-filter
              ariaLabel="Filter communications by customer or supplier"
              placeholder="All customers and suppliers"
              emptyValue="all"
              searchPlaceholder="Search people or businesses…"
              [options]="partyFilterOptions()"
              [value]="partyFilter()"
              (valueChange)="setPartyFilter($event)"
            />
          </app-form-field>
          <app-form-field label="Document" class="lg:w-44">
            <select
              class="select select-bordered select-sm w-full"
              [value]="documentFilter()"
              (change)="setFilter('document', $event)"
            >
              <option value="all">All communications</option>
              <option value="receipt">Receipts</option>
              <option value="invoice">Invoices</option>
              <option value="proforma">Proformas</option>
              <option value="purchase_order">Purchase orders</option>
            </select>
          </app-form-field>
          <app-form-field label="From" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="from()"
              (change)="setDate('from', $event)"
            />
          </app-form-field>
          <app-form-field label="To" class="lg:w-40">
            <input
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="to()"
              (change)="setDate('to', $event)"
            />
          </app-form-field>
          <div class="flex flex-wrap gap-2 sm:col-span-2">
            <button
              appButton
              [variant]="last30Active() ? 'soft' : 'ghost'"
              type="button"
              (click)="setLast30()"
            >
              @if (last30Active()) {
                <app-icon name="heroCheck" size="sm" />
              }
              30 days
            </button>
            <button
              appButton
              [variant]="allTimeActive() ? 'soft' : 'ghost'"
              type="button"
              (click)="setAllTime()"
            >
              @if (allTimeActive()) {
                <app-icon name="heroCheck" size="sm" />
              }
              All time
            </button>
          </div>
        </div>
      </app-list-search-bar>

      @if (!loading() && outbox().length === 0) {
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
            heading="Delivery history"
            [description]="outboxTotal() + ' matching deliveries'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Queued</th>
                  <th>Channel</th>
                  <th>Customer</th>
                  <th>Recipient</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Opens</th>
                </tr>
              </thead>
              <tbody>
                @for (message of outbox(); track message.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ time(message.created_at) }}</td>
                    <td class="uppercase">{{ message.channel }}</td>
                    <td>
                      @if (message.customers; as party) {
                        <a
                          class="link link-hover font-medium"
                          [routerLink]="party.is_supplier ? '/suppliers' : '/customers'"
                          [queryParams]="party.is_supplier ? {} : { customer: party.id }"
                        >
                          {{ partyName(message) }}
                        </a>
                        <p class="table-secondary">
                          {{ party.is_supplier ? 'Supplier' : 'Customer' }}
                          @if (message.document_copy_role === 'company') {
                            · company copy
                          }
                        </p>
                      } @else {
                        <span class="text-base-content/40">Unlinked</span>
                      }
                    </td>
                    <td class="font-mono text-xs">{{ message.recipient }}</td>
                    <td class="max-w-lg">
                      <p class="line-clamp-2 text-sm">{{ message.body }}</p>
                      @if (documentOrderId(message); as orderId) {
                        <a
                          class="mt-1 inline-flex text-xs font-medium link link-hover"
                          routerLink="/orders"
                          [queryParams]="{
                            order: orderId,
                            customer: message.customer_id,
                            range: 'all',
                          }"
                        >
                          Open source document
                        </a>
                      }
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
                    <td class="whitespace-nowrap">
                      {{ openLabel(message) }}
                      @if (lastOpenedAt(message); as openedAt) {
                        <p
                          class="table-secondary"
                          [title]="'A valid secure-link load; refreshes count again.'"
                        >
                          Last {{ time(openedAt) }}
                        </p>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <app-mobile-list>
          @for (message of outbox(); track message.id) {
            <div mobileListRow>
              <div class="grid min-h-20 gap-3 p-3">
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
                    @if (message.customers) {
                      <a
                        class="mt-1 inline-flex text-sm font-medium link link-hover"
                        [routerLink]="message.customers.is_supplier ? '/suppliers' : '/customers'"
                        [queryParams]="
                          message.customers.is_supplier ? {} : { customer: message.customers.id }
                        "
                      >
                        {{ partyName(message) }}
                        @if (message.document_copy_role === 'company') {
                          · company copy
                        }
                      </a>
                    }
                  </div>
                  <span class="type-caption shrink-0">{{ time(message.created_at) }}</span>
                </div>
                <p class="border-t border-base-300/60 pt-3 text-sm">{{ message.body }}</p>
                @if (documentOrderId(message); as orderId) {
                  <a
                    class="inline-flex text-sm font-medium link link-hover"
                    routerLink="/orders"
                    [queryParams]="{
                      order: orderId,
                      customer: message.customer_id,
                      range: 'all',
                    }"
                  >
                    Open source document
                  </a>
                }
                @if (message.status === 'failed' && message.error) {
                  <p class="text-xs text-error">{{ message.error }}</p>
                }
                @if (message.external_document_links || message.customer_statement_links) {
                  <p class="text-xs text-base-content/60">{{ openLabel(message) }}</p>
                }
              </div>
            </div>
          }
        </app-mobile-list>

        <div class="mt-3">
          <app-pagination
            [currentPage]="outboxPage()"
            [totalPages]="outboxTotalPages()"
            [totalItems]="outboxTotal()"
            [itemsPerPage]="outboxPageSize()"
            itemLabel="deliveries"
            [showItemsPerPage]="true"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
    </app-page>
  `,
})
export class CommunicationsComponent implements OnInit, OnDestroy {
  private readonly notifications = inject(NotificationsService);
  private readonly partyCache = inject(PartyCacheService);

  protected readonly usage = signal<{
    sms: { used: number; reserved: number; limit: number | null };
    whatsapp: { used: number; reserved: number; limit: number | null };
  } | null>(null);
  protected readonly outbox = signal<OutboxMessageWithParty[]>([]);
  protected readonly loading = signal(false);
  protected readonly query = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly statusFilter = signal('all');
  protected readonly partyFilter = signal('all');
  protected readonly documentFilter = signal('all');
  protected readonly from = signal(this.daysAgoIso(29));
  protected readonly to = signal(this.todayIso());
  protected readonly messageSortOptions = MESSAGE_SORT_OPTIONS;
  protected readonly messageSort = signal('queued');
  protected readonly messageSortDirection = signal<ListSortDirection>('desc');
  protected readonly outboxPage = signal(1);
  protected readonly outboxPageSize = signal(10);
  protected readonly outboxTotal = signal(0);
  protected readonly error = signal<string | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSequence = 0;
  protected readonly partyOptions = computed(() => [
    ...this.partyCache.customers(),
    ...this.partyCache.suppliers(),
  ]);
  protected readonly partyFilterOptions = computed<readonly SearchableFilterOption[]>(() => {
    const unique = new Map<string, SearchableFilterOption>();
    for (const party of this.partyOptions()) {
      unique.set(party.id, {
        value: party.id,
        label: this.partyLabel(party),
        description: party.phone || undefined,
        searchText: party.email ?? undefined,
      });
    }
    return [...unique.values()];
  });
  protected readonly hasOutboxFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.channelFilter() !== 'all' ||
      this.statusFilter() !== 'all' ||
      this.partyFilter() !== 'all' ||
      this.documentFilter() !== 'all' ||
      !this.last30Active()
  );
  protected readonly messageFilterCount = computed(
    () =>
      Number(this.channelFilter() !== 'all') +
      Number(this.statusFilter() !== 'all') +
      Number(this.partyFilter() !== 'all') +
      Number(this.documentFilter() !== 'all') +
      Number(!this.last30Active())
  );
  protected readonly messageStats = computed(() => {
    const rows = this.outbox();
    return [
      {
        label: 'Matching deliveries',
        value: this.outboxTotal(),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Pending on page',
        value: rows.filter(message => message.status === 'pending').length,
        tone: 'warning' as const,
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Sent on page',
        value: rows.filter(message => message.status === 'sent').length,
        tone: 'success' as const,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Failed on page',
        value: rows.filter(message => message.status === 'failed').length,
        tone: 'error' as const,
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  protected readonly outboxTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.outboxTotal() / this.outboxPageSize()))
  );

  async ngOnInit(): Promise<void> {
    await this.partyCache.ensureLoaded();
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    try {
      const [usage, result] = await Promise.all([
        this.notifications.communicationUsage(),
        this.notifications.outboxPage({
          page: this.outboxPage(),
          pageSize: this.outboxPageSize(),
          search: this.query(),
          matchingCustomerIds: this.matchingPartyIds(this.query()),
          channel: this.channelFilter() === 'all' ? undefined : this.channelFilter(),
          status: this.statusFilter() === 'all' ? undefined : this.statusFilter(),
          documentType: this.documentFilter() === 'all' ? undefined : this.documentFilter(),
          customerId: this.partyFilter() === 'all' ? undefined : this.partyFilter(),
          from: this.from() || undefined,
          to: this.to() || undefined,
          sortBy:
            this.messageSort() === 'queued'
              ? 'created_at'
              : (this.messageSort() as 'recipient' | 'channel' | 'status'),
          sortDirection: this.messageSortDirection(),
        }),
      ]);
      if (sequence !== this.loadSequence) return;
      this.usage.set(usage);
      this.outbox.set(result.rows);
      this.outboxTotal.set(result.count);
      this.error.set(null);
    } catch (err) {
      if (sequence === this.loadSequence)
        this.error.set(err instanceof Error ? err.message : 'Failed to load communications');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
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

  protected partyName(message: OutboxMessageWithParty): string {
    if (!message.customers) return '';
    return [message.customers.first_name, message.customers.last_name].filter(Boolean).join(' ');
  }

  protected documentOrderId(message: OutboxMessageWithParty): string | null {
    if (!message.document_subject_id) return null;
    return ['receipt', 'invoice', 'proforma'].includes(message.document_type ?? '')
      ? message.document_subject_id
      : null;
  }

  protected openLabel(message: OutboxMessageWithParty): string {
    const documentLink = message.external_document_links;
    const link = documentLink ?? message.customer_statement_links;
    if (!link) return '—';
    const opens =
      link.open_count === 0
        ? 'Not opened'
        : link.open_count === 1
          ? 'Opened once'
          : `Opened ${link.open_count} times`;
    return message.document_copy_role === 'company' ? `Company copy · ${opens}` : opens;
  }

  protected lastOpenedAt(message: OutboxMessageWithParty): string | null {
    return (
      message.external_document_links?.last_opened_at ??
      message.customer_statement_links?.last_opened_at ??
      null
    );
  }

  protected setFilter(kind: 'channel' | 'status' | 'document', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'channel') this.channelFilter.set(value);
    else if (kind === 'status') this.statusFilter.set(value);
    else this.documentFilter.set(value);
    this.reloadFromStart();
  }

  protected setPartyFilter(value: string): void {
    this.partyFilter.set(value);
    this.reloadFromStart();
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reloadFromStart(), 250);
  }

  protected setDate(kind: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (kind === 'from') this.from.set(value);
    else this.to.set(value);
    this.reloadFromStart();
  }

  protected setLast30(): void {
    this.from.set(this.daysAgoIso(29));
    this.to.set(this.todayIso());
    this.reloadFromStart();
  }

  protected setAllTime(): void {
    this.from.set('');
    this.to.set('');
    this.reloadFromStart();
  }

  protected clearMessageFilters(): void {
    this.channelFilter.set('all');
    this.statusFilter.set('all');
    this.partyFilter.set('all');
    this.documentFilter.set('all');
    this.from.set(this.daysAgoIso(29));
    this.to.set(this.todayIso());
    this.reloadFromStart();
  }

  protected last30Active(): boolean {
    return this.from() === this.daysAgoIso(29) && this.to() === this.todayIso();
  }

  protected allTimeActive(): boolean {
    return !this.from() && !this.to();
  }

  protected reloadFromStart(): void {
    this.outboxPage.set(1);
    void this.load();
  }

  protected changePage(page: number): void {
    this.outboxPage.set(page);
    void this.load();
  }

  protected changePageSize(size: number): void {
    this.outboxPageSize.set(size);
    this.reloadFromStart();
  }

  protected partyLabel(party: {
    first_name: string;
    last_name: string | null;
    is_supplier: boolean;
  }): string {
    return `${[party.first_name, party.last_name].filter(Boolean).join(' ')}${party.is_supplier ? ' · Supplier' : ''}`;
  }

  private matchingPartyIds(query: string): string[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return this.partyOptions()
      .filter(party =>
        [party.first_name, party.last_name, party.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalized)
      )
      .slice(0, RELATED_PARTY_SEARCH_ID_LIMIT)
      .map(party => party.id);
  }

  private todayIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }

  private daysAgoIso(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
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
