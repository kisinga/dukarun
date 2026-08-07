import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import {
  CampaignPreview,
  MessageCampaign,
  MessageTemplate,
  MessagingCustomer,
  NotificationsService,
  OutboxMessage,
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
import { sortList } from '../shared/ui/list-sort';
import { StatBarComponent } from '../shared/ui/stat-bar.component';

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  sent: 'success',
  failed: 'error',
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
      subtitle="Create customer campaigns and monitor SMS or WhatsApp delivery."
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
              <app-form-field label="Campaign name" [required]="true">
                <input
                  class="input input-bordered input-sm w-full"
                  placeholder="August customer update"
                  [formControl]="campaignName"
                />
              </app-form-field>
              <div class="grid gap-3 sm:grid-cols-2">
                <app-form-field label="Audience" [required]="true">
                  <select class="select select-bordered select-sm w-full" [formControl]="audience">
                    <option value="all">All customers</option>
                    <option value="overdue">Customers with overdue credit</option>
                    <option value="credit_approved">Credit-approved customers</option>
                    <option value="selected">Selected customers</option>
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

              @if (audience.value === 'selected') {
                <div class="rounded-box border border-base-300 p-3">
                  <p class="text-sm font-medium">Choose customers</p>
                  <div class="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                    @for (customer of customers(); track customer.id) {
                      <label
                        class="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="selectedCustomerIds().includes(customer.id)"
                          (change)="toggleCustomer(customer.id, $event)"
                        />
                        <span class="text-sm"
                          >{{ customer.first_name }} {{ customer.last_name ?? '' }}</span
                        >
                        @if (!customer.phone) {
                          <span class="type-caption text-warning">No phone</span>
                        }
                      </label>
                    }
                  </div>
                </div>
              }

              <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <app-form-field
                  label="Saved template"
                  [hint]="'Variables: {{customer_first_name}}, {{store_name}}, {{store_contact}}'"
                >
                  <select
                    class="select select-bordered select-sm w-full"
                    [formControl]="templateId"
                    (change)="applyTemplate()"
                  >
                    <option value="">No template</option>
                    @for (template of templates(); track template.id) {
                      <option [value]="template.id">
                        {{ template.name }} · v{{ template.version }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <button
                  appButton
                  variant="outline"
                  type="button"
                  [disabled]="!body.value.trim()"
                  (click)="saveTemplate()"
                >
                  Save as template
                </button>
              </div>
              @if (templateId.value) {
                <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <app-form-field
                    label="Test recipient"
                    hint="A test send uses the selected channel quota."
                  >
                    <input
                      class="input input-bordered input-sm w-full"
                      placeholder="+254…"
                      [formControl]="testRecipient"
                    />
                  </app-form-field>
                  <button
                    appButton
                    variant="outline"
                    type="button"
                    [disabled]="!testRecipient.value.trim()"
                    (click)="sendTemplateTest()"
                  >
                    Send test
                  </button>
                </div>
              }

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

              @if (campaignPreview(); as preview) {
                <div class="rounded-box border border-base-300 bg-base-200/50 p-3 text-sm">
                  <p class="font-semibold">Campaign preview</p>
                  <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <span
                      ><span class="type-caption block">Eligible</span>{{ preview.eligible }}</span
                    >
                    <span
                      ><span class="type-caption block">Skipped</span>{{ preview.skipped }}</span
                    >
                    <span
                      ><span class="type-caption block">Quota units</span>{{ preview.units }}</span
                    >
                    <span
                      ><span class="type-caption block">Remaining</span
                      >{{ preview.remaining ?? 'Unlimited' }}</span
                    >
                  </div>
                </div>
              }

              @if (usage(); as usage) {
                <div
                  class="grid gap-2 rounded-box border border-base-300 p-3 text-sm sm:grid-cols-2"
                >
                  @for (entry of quotaRows(usage); track entry.label) {
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

              <div class="flex flex-wrap gap-2">
                <button
                  appButton
                  variant="outline"
                  type="button"
                  [loading]="previewBusy()"
                  [disabled]="!canCompose()"
                  (click)="previewCampaign()"
                >
                  Preview audience
                </button>
                <button
                  appButton
                  type="submit"
                  [loading]="busy()"
                  [disabled]="busy() || !campaignPreview() || !canCompose()"
                >
                  <app-icon name="heroChatBubbleLeftRight" /> Send campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      @if (campaigns().length > 0) {
        <app-data-table-shell
          title="Campaign history"
          description="Pause, resume, cancel, or retry failed recipients."
        >
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Progress</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (campaign of campaigns(); track campaign.id) {
                <tr>
                  <td>
                    <strong>{{ campaign.name }}</strong>
                    <p class="type-caption">
                      {{ campaign.channel.toUpperCase() }} · {{ time(campaign.created_at) }}
                    </p>
                  </td>
                  <td>
                    <app-status-badge
                      [type]="campaignStatusType(campaign.status)"
                      [label]="campaign.status"
                      size="xs"
                    />
                  </td>
                  <td class="tabular-nums">
                    {{ campaign.sent_count }} sent · {{ campaign.failed_count }} failed ·
                    {{ campaign.skipped_count }} skipped
                  </td>
                  <td>
                    <div class="flex justify-end gap-1">
                      @if (campaign.status === 'queued' || campaign.status === 'sending') {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="campaignAction(campaign.id, 'pause')"
                        >
                          Pause
                        </button>
                      }
                      @if (campaign.status === 'paused') {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="campaignAction(campaign.id, 'resume')"
                        >
                          Resume
                        </button>
                      }
                      @if (campaign.failed_count > 0) {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="retryCampaign(campaign.id)"
                        >
                          Retry failed
                        </button>
                      }
                      @if (!['completed', 'cancelled'].includes(campaign.status)) {
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="campaignAction(campaign.id, 'cancel')"
                        >
                          Cancel
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </app-data-table-shell>
      }

      <!-- Recent outbox -->
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

  protected readonly campaignName = new FormControl('', { nonNullable: true });
  protected readonly audience = new FormControl<'all' | 'overdue' | 'credit_approved' | 'selected'>(
    'all',
    {
      nonNullable: true,
    }
  );
  protected readonly channel = new FormControl<'sms' | 'whatsapp'>('sms', { nonNullable: true });
  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly templateId = new FormControl('', { nonNullable: true });
  protected readonly testRecipient = new FormControl('', { nonNullable: true });
  protected readonly templates = signal<MessageTemplate[]>([]);
  protected readonly campaigns = signal<MessageCampaign[]>([]);
  protected readonly customers = signal<MessagingCustomer[]>([]);
  protected readonly selectedCustomerIds = signal<string[]>([]);
  protected readonly usage = signal<{
    sms: { used: number; reserved: number; limit: number | null };
    whatsapp: { used: number; reserved: number; limit: number | null };
  } | null>(null);
  protected readonly outbox = signal<OutboxMessage[]>([]);
  protected readonly composerOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly query = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly statusFilter = signal('all');
  protected readonly messageSortOptions = MESSAGE_SORT_OPTIONS;
  protected readonly messageSort = signal('queued');
  protected readonly messageSortDirection = signal<ListSortDirection>('desc');
  protected readonly outboxPage = signal(1);
  protected readonly outboxPageSize = signal(10);
  protected readonly busy = signal(false);
  protected readonly previewBusy = signal(false);
  protected readonly campaignPreview = signal<CampaignPreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

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
      const [usage, outbox, templates, campaigns, customers] = await Promise.all([
        this.notifications.communicationUsage(),
        this.notifications.recentOutbox(),
        this.notifications.messageTemplates(),
        this.notifications.recentCampaigns(),
        this.notifications.messagingCustomers(),
      ]);
      this.usage.set(usage);
      this.outbox.set(outbox);
      this.templates.set(templates);
      this.campaigns.set(campaigns);
      this.customers.set(customers);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async send(): Promise<void> {
    const text = this.body.value.trim();
    if (!text || !this.campaignName.value.trim() || !this.campaignPreview()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const count = await this.notifications.createAndSendCampaign({
        name: this.campaignName.value.trim(),
        channel: this.channel.value,
        body: text,
        audience: this.audience.value,
        ...(this.audience.value === 'selected' ? { customerIds: this.selectedCustomerIds() } : {}),
        ...(this.templateId.value ? { templateId: this.templateId.value } : {}),
      });
      this.notice.set(`Queued for ${count} customer(s)`);
      this.campaignName.setValue('');
      this.body.setValue('');
      this.templateId.setValue('');
      this.selectedCustomerIds.set([]);
      this.campaignPreview.set(null);
      this.composerOpen.set(false);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Queue failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected canCompose(): boolean {
    return (
      this.campaignName.value.trim().length > 0 &&
      this.body.value.trim().length > 0 &&
      (this.audience.value !== 'selected' || this.selectedCustomerIds().length > 0)
    );
  }

  protected async previewCampaign(): Promise<void> {
    if (!this.canCompose()) return;
    this.previewBusy.set(true);
    this.error.set(null);
    try {
      this.campaignPreview.set(
        await this.notifications.previewCampaign(
          this.channel.value,
          this.body.value.trim(),
          this.audience.value,
          this.audience.value === 'selected' ? this.selectedCustomerIds() : undefined
        )
      );
    } catch (err) {
      this.campaignPreview.set(null);
      this.error.set(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      this.previewBusy.set(false);
    }
  }

  protected toggleCustomer(customerId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedCustomerIds.update(ids =>
      checked ? [...ids, customerId] : ids.filter(id => id !== customerId)
    );
    this.campaignPreview.set(null);
  }

  protected applyTemplate(): void {
    const template = this.templates().find(item => item.id === this.templateId.value);
    if (!template) return;
    this.body.setValue(
      (this.channel.value === 'sms' ? template.sms_body : template.whatsapp_body) ?? ''
    );
    this.campaignPreview.set(null);
  }

  protected async saveTemplate(): Promise<void> {
    const name = this.campaignName.value.trim();
    const text = this.body.value.trim();
    if (!name || !text) {
      this.error.set('Add a campaign name and message before saving a template.');
      return;
    }
    this.busy.set(true);
    try {
      const existing = this.templates().find(item => item.id === this.templateId.value);
      const smsBody = this.channel.value === 'sms' ? text : (existing?.sms_body ?? text);
      const whatsappBody =
        this.channel.value === 'whatsapp' ? text : (existing?.whatsapp_body ?? text);
      const id = await this.notifications.saveMessageTemplate(
        name,
        smsBody,
        whatsappBody,
        existing?.company_id ? existing.id : undefined
      );
      this.templates.set(await this.notifications.messageTemplates());
      this.templateId.setValue(id);
      this.notice.set(existing?.company_id ? 'Template updated.' : 'Template saved.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Template save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async sendTemplateTest(): Promise<void> {
    if (!this.templateId.value || !this.testRecipient.value.trim()) return;
    this.busy.set(true);
    try {
      await this.notifications.testMessageTemplate(
        this.templateId.value,
        this.channel.value,
        this.testRecipient.value.trim()
      );
      this.notice.set('Test message queued.');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      this.busy.set(false);
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

  protected campaignStatusType(status: string): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'completed') return 'success';
    if (status === 'failed' || status === 'partial') return 'error';
    if (status === 'cancelled') return 'neutral';
    return 'warning';
  }

  protected async campaignAction(
    campaignId: string,
    action: 'pause' | 'resume' | 'cancel'
  ): Promise<void> {
    this.busy.set(true);
    try {
      await this.notifications.setCampaignStatus(campaignId, action);
      this.notice.set(
        `Campaign ${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'cancelled'}.`
      );
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Campaign update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async retryCampaign(campaignId: string): Promise<void> {
    this.busy.set(true);
    try {
      const count = await this.notifications.retryFailedCampaignRecipients(campaignId);
      this.notice.set(`${count} failed recipient(s) queued again.`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Campaign retry failed');
    } finally {
      this.busy.set(false);
    }
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
