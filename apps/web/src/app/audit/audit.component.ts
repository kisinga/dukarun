import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Json } from '@dukarun/shared-types';
import { formatKes } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { AuditActor, AuditEvent, AuditService } from './audit.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { ButtonComponent } from '../shared/ui/button.component';

interface ChangeItem {
  field: string;
  before: string;
  after: string;
}

const ENTITY_LABELS: Record<string, string> = {
  accounting_periods: 'accounting period',
  approvals: 'request',
  cash_drawer_counts: 'drawer count',
  cashier_sessions: 'cashier session',
  companies: 'company settings',
  company_memberships: 'team member',
  customers: 'customer',
  inventory_movements: 'stock',
  order_lines: 'sale item',
  orders: 'sale',
  payment_methods: 'payment method',
  payments: 'payment',
  product_variants: 'product variant',
  products: 'product',
  purchase_payments: 'purchase payment',
  purchases: 'purchase',
  reconciliations: 'reconciliation',
  refunds: 'refund',
  roles: 'role',
  stock_locations: 'stock location',
};

const FIELD_LABELS: Record<string, string> = {
  authorization_status: 'Access',
  cashier_pending_at: 'Sent to cashier',
  credit_limit: 'Credit limit',
  decision_reason: 'Decision reason',
  enabled: 'Enabled',
  first_name: 'First name',
  is_credit_sale: 'Credit sale',
  last_name: 'Last name',
  movement_type: 'Movement',
  new_quantity: 'New quantity',
  previous_quantity: 'Previous quantity',
  public_storefront_enabled: 'Storefront',
  requires_reconciliation: 'Reconciliation required',
  source_type: 'Source',
  total_cost: 'Total cost',
  unit_cost: 'Unit cost',
  void_reason: 'Void reason',
};

const HIDDEN_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'decided_by',
  'voided_by',
]);

const REASON_FIELDS = new Set(['decision_reason', 'void_reason', 'reason', 'notes', 'memo']);

@Component({
  selector: 'app-audit',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    EmptyStateComponent,
    IconComponent,
    ListSearchBarComponent,
    PageLayoutComponent,
    PaginationComponent,
    ButtonComponent,
  ],
  template: `
    <app-page
      title="Audit trail"
      subtitle="A clear record of who changed what and when."
      backLink="/settings"
      backLabel="Settings"
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        type="button"
        title="Refresh audit trail"
        aria-label="Refresh audit trail"
        [loading]="loading()"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>

      <app-list-search-bar
        placeholder="Search activity, record, reason, or person…"
        [searchQuery]="search()"
        (searchQueryChange)="onSearch($event)"
      >
        <span summary class="type-caption">
          @if (loading() && events().length === 0) {
            Loading history…
          } @else {
            {{ total() }} {{ total() === 1 ? 'activity' : 'activities' }} found
          }
        </span>
        <div filters class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select
            class="select select-bordered min-h-11 w-full select-sm sm:w-auto"
            aria-label="Filter by action"
            [value]="action()"
            (change)="setFilter(action, $event)"
          >
            <option value="">All actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="stock">Stock movement</option>
          </select>
          <select
            class="select select-bordered min-h-11 w-full select-sm sm:w-auto"
            aria-label="Filter by area"
            [value]="area()"
            (change)="setFilter(area, $event)"
          >
            <option value="">All areas</option>
            <option value="sales">Sales</option>
            <option value="inventory">Inventory</option>
            <option value="cash">Cash control</option>
            <option value="people">Customers</option>
            <option value="team">Team</option>
            <option value="settings">Settings</option>
          </select>
          <select
            class="select select-bordered min-h-11 w-full select-sm sm:w-auto"
            aria-label="Filter by person"
            [value]="actor()"
            (change)="setFilter(actor, $event)"
          >
            <option value="">Everyone</option>
            @for (person of actors(); track person.user_id) {
              <option [value]="person.user_id">{{ actorOption(person) }}</option>
            }
          </select>
          <select
            class="select select-bordered min-h-11 w-full select-sm sm:w-auto"
            aria-label="Filter by date"
            [value]="period()"
            (change)="setFilter(period, $event)"
          >
            <option value="">Any time</option>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
        @if (hasFilters()) {
          <div badges class="flex flex-wrap items-center gap-2">
            <span class="type-caption">Filters applied</span>
            <button type="button" class="btn btn-ghost btn-xs" (click)="clearFilters()">
              Clear all
            </button>
          </div>
        }
      </app-list-search-bar>

      @if (error()) {
        <div class="alert mb-4 border border-error/20 bg-error/5 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span class="flex-1">{{ error() }}</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="load()">Try again</button>
        </div>
      }

      @if (loading() && events().length === 0) {
        <div class="card bg-base-100 p-4" aria-label="Loading activity">
          @for (row of loadingRows; track row) {
            <div
              class="flex animate-pulse items-center gap-3 border-b border-base-300/60 py-4 last:border-0"
            >
              <div class="h-9 w-9 rounded-full bg-base-300"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-2/3 rounded bg-base-300"></div>
                <div class="h-3 w-1/3 rounded bg-base-300"></div>
              </div>
            </div>
          }
        </div>
      } @else if (!loading() && events().length === 0) {
        <app-empty-state
          icon="heroClipboardDocumentList"
          [title]="hasFilters() ? 'No activity matches these filters' : 'No activity recorded yet'"
          [description]="
            hasFilters()
              ? 'Clear a filter or try a broader search.'
              : 'Changes to sales, stock, people, cash control, and settings will appear here.'
          "
        >
          @if (hasFilters()) {
            <button actions type="button" class="btn btn-primary btn-sm" (click)="clearFilters()">
              Clear filters
            </button>
          }
        </app-empty-state>
      } @else {
        <div class="card hidden overflow-hidden bg-base-100 md:block">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Activity</th>
                  <th>Person</th>
                  <th>Area</th>
                  <th class="w-12"><span class="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                @for (event of events(); track event.event_id) {
                  <tr
                    role="button"
                    tabindex="0"
                    [attr.aria-expanded]="expanded() === event.event_id"
                    (click)="toggle(event.event_id)"
                    (keydown.enter)="toggle(event.event_id)"
                    (keydown.space)="$event.preventDefault(); toggle(event.event_id)"
                  >
                    <td class="whitespace-nowrap">
                      <p class="table-primary">{{ relativeTime(event.occurred_at) }}</p>
                      <p class="table-secondary">{{ dateTime(event.occurred_at) }}</p>
                    </td>
                    <td>
                      <div class="flex items-center gap-3">
                        <span
                          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/60"
                        >
                          <app-icon [name]="eventIcon(event)" />
                        </span>
                        <div class="min-w-0">
                          <p class="table-primary">{{ activityTitle(event) }}</p>
                          <p class="table-secondary line-clamp-1">{{ activitySummary(event) }}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p class="table-primary">{{ actorName(event) }}</p>
                      <p class="table-secondary">{{ event.actor_role || 'Automated activity' }}</p>
                    </td>
                    <td>
                      <span class="badge badge-ghost badge-sm">{{ areaLabel(event.area) }}</span>
                    </td>
                    <td class="text-right">
                      <app-icon
                        [name]="expanded() === event.event_id ? 'heroChevronUp' : 'heroChevronDown'"
                      />
                    </td>
                  </tr>
                  @if (expanded() === event.event_id) {
                    <tr class="row-detail">
                      <td colspan="5">
                        <ng-container *ngTemplateOutlet="details; context: { $implicit: event }" />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="space-y-3 md:hidden">
          @for (event of events(); track event.event_id) {
            <article class="card bg-base-100">
              <button
                type="button"
                class="min-h-11 w-full p-4 text-left"
                [attr.aria-expanded]="expanded() === event.event_id"
                (click)="toggle(event.event_id)"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/60"
                  >
                    <app-icon [name]="eventIcon(event)" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-center gap-2">
                      <span class="table-primary">{{ activityTitle(event) }}</span>
                      <span class="badge badge-ghost badge-xs">{{ areaLabel(event.area) }}</span>
                    </span>
                    <span class="mt-1 block text-sm text-base-content/70">{{
                      activitySummary(event)
                    }}</span>
                    <span class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 type-caption">
                      <span>{{ actorName(event) }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ relativeTime(event.occurred_at) }}</span>
                    </span>
                  </span>
                  <app-icon
                    class="mt-1 text-base-content/40"
                    [name]="expanded() === event.event_id ? 'heroChevronUp' : 'heroChevronDown'"
                  />
                </div>
              </button>
              @if (expanded() === event.event_id) {
                <div class="border-t border-base-300 p-4">
                  <ng-container *ngTemplateOutlet="details; context: { $implicit: event }" />
                </div>
              }
            </article>
          }
        </div>

        <ng-template #details let-event>
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div class="min-w-0">
              @if (event.reason) {
                <div class="mb-3 rounded-box border border-info/20 bg-info/5 p-3">
                  <p class="type-caption font-semibold uppercase tracking-wide">Reason</p>
                  <p class="mt-1 text-sm">{{ event.reason }}</p>
                </div>
              }
              @if (changes(event).length > 0) {
                <p class="mb-2 type-caption font-semibold uppercase tracking-wide">
                  {{ detailHeading(event) }}
                </p>
                <div class="overflow-hidden rounded-box border border-base-300">
                  @for (change of changes(event); track change.field) {
                    <div
                      class="grid gap-1 border-b border-base-300/60 p-3 last:border-0 sm:grid-cols-[10rem_1fr]"
                    >
                      <span class="text-xs font-semibold">{{ fieldLabel(change.field) }}</span>
                      <span class="min-w-0 text-sm">
                        @if (event.operation === 'UPDATE') {
                          <span class="break-words text-base-content/50 line-through">{{
                            change.before
                          }}</span>
                          <span class="mx-2 text-base-content/30">→</span>
                        }
                        <span class="break-words">{{ change.after }}</span>
                      </span>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-sm text-base-content/60">
                  No additional field details were recorded.
                </p>
              }
            </div>
            <div class="space-y-3 rounded-box bg-base-200/60 p-3 text-sm">
              <div>
                <p class="type-caption">Person</p>
                <p class="font-medium">{{ actorName(event) }}</p>
                @if (event.actor_role) {
                  <p class="text-xs text-base-content/60">{{ event.actor_role }}</p>
                }
              </div>
              <div>
                <p class="type-caption">Time</p>
                <p>{{ dateTime(event.occurred_at) }}</p>
              </div>
              <div>
                <p class="type-caption">Record</p>
                <p class="font-medium">{{ entityName(event) }}</p>
              </div>
              @if (areaRoute(event.area); as route) {
                <a [routerLink]="route" class="btn btn-outline btn-sm min-h-11 w-full"
                  >Open {{ areaLabel(event.area) }}</a
                >
              }
            </div>
          </div>
        </ng-template>

        @if (totalPages() > 1) {
          <div class="mt-4">
            <app-pagination
              [currentPage]="page()"
              [totalPages]="totalPages()"
              [totalItems]="total()"
              [itemsPerPage]="pageSize"
              itemLabel="activities"
              (pageChange)="goToPage($event)"
            />
          </div>
        }
      }
    </app-page>
  `,
})
export class AuditComponent implements OnInit, OnDestroy {
  private readonly audit = inject(AuditService);
  private readonly supabase = inject(SupabaseService);
  private readonly permissions = inject(PermissionsService);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  protected readonly events = signal<AuditEvent[]>([]);
  protected readonly actors = signal<AuditActor[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize))
  );
  protected readonly expanded = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly action = signal('');
  protected readonly area = signal('');
  protected readonly actor = signal('');
  protected readonly period = signal('');
  protected readonly loadingRows = [1, 2, 3, 4, 5];
  protected readonly hasFilters = computed(
    () => !!(this.search() || this.action() || this.area() || this.actor() || this.period())
  );

  async ngOnInit(): Promise<void> {
    const [actors] = await Promise.all([this.loadActors(), this.load()]);
    return actors;
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected async load(): Promise<void> {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.audit.events(
        {
          search: this.search().trim(),
          action: this.action(),
          area: this.area(),
          actor: this.actor(),
          from: this.fromDate(),
        },
        this.page(),
        this.pageSize
      );
      if (requestId !== this.requestId) return;
      this.events.set(rows);
      this.total.set(rows[0]?.total_count ?? 0);
      this.expanded.set(null);
    } catch (err) {
      if (requestId !== this.requestId) return;
      this.error.set(err instanceof Error ? err.message : 'Could not load the audit trail.');
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reloadFromStart(), 300);
  }

  protected setFilter(target: { set(value: string): void }, event: Event): void {
    target.set((event.target as HTMLSelectElement).value);
    this.reloadFromStart();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.action.set('');
    this.area.set('');
    this.actor.set('');
    this.period.set('');
    this.reloadFromStart();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    void this.load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected toggle(eventId: string): void {
    this.expanded.update(current => (current === eventId ? null : eventId));
  }

  protected activityTitle(event: AuditEvent): string {
    const entity = this.entityName(event);
    if (event.event_source === 'inventory') {
      const verbs: Record<string, string> = {
        ADJUSTMENT: 'Adjusted',
        PURCHASE: 'Received',
        REVERSAL: 'Reversed',
        SALE: 'Sold',
      };
      return `${verbs[event.operation] ?? 'Moved'} ${entity}`;
    }

    const before = this.asRecord(event.before_data);
    const after = this.asRecord(event.after_data);
    if (event.entity_type === 'orders' && event.operation === 'UPDATE') {
      const status = this.text(after['status']);
      if (status && status !== this.text(before['status'])) {
        const statusVerbs: Record<string, string> = {
          completed: 'Completed',
          pending_payment: 'Sent to cashier',
          voided: 'Voided',
        };
        if (statusVerbs[status]) return `${statusVerbs[status]} ${entity}`;
      }
    }
    if (event.entity_type === 'approvals' && event.operation === 'UPDATE') {
      const status = this.text(after['status']);
      if (status === 'approved') return `Approved ${entity}`;
      if (status === 'denied') return `Denied ${entity}`;
    }
    if (event.entity_type === 'payments' && event.operation === 'INSERT') {
      return `Recorded ${entity}`;
    }
    if (event.entity_type === 'refunds' && event.operation === 'INSERT') {
      return `Recorded ${entity}`;
    }
    const verbs: Record<string, string> = {
      INSERT: 'Created',
      UPDATE: 'Updated',
      DELETE: 'Deleted',
    };
    return `${verbs[event.operation] ?? 'Changed'} ${entity}`;
  }

  protected activitySummary(event: AuditEvent): string {
    if (event.event_source === 'inventory') {
      const stock = this.stockQuantitySummary(event);
      return [stock, event.reason].filter(Boolean).join(' · ') || 'Stock quantity changed';
    }
    if (event.reason) return event.reason;
    const changed = this.changes(event);
    if (changed.length === 0) return 'No additional details';
    const labels = changed.slice(0, 3).map(item => this.fieldLabel(item.field));
    return `${labels.join(', ')}${changed.length > 3 ? ` and ${changed.length - 3} more` : ''}`;
  }

  protected entityName(event: AuditEvent): string {
    const data = { ...this.asRecord(event.before_data), ...this.asRecord(event.after_data) };
    const type = ENTITY_LABELS[event.entity_type] ?? event.entity_type.replaceAll('_', ' ');
    const firstName = this.text(data['first_name']);
    const lastName = this.text(data['last_name']);
    const person = [firstName, lastName].filter(Boolean).join(' ');
    const product = this.text(data['product']);
    const variant = this.text(data['variant']);
    const label =
      this.text(data['code']) ||
      this.text(data['name']) ||
      person ||
      [product, variant].filter(Boolean).join(' · ') ||
      this.text(data['reference']);
    return label ? `${type} ${label}` : type;
  }

  protected changes(event: AuditEvent): ChangeItem[] {
    const before = this.asRecord(event.before_data);
    const after = this.asRecord(event.after_data);
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...fields]
      .filter(field => !HIDDEN_FIELDS.has(field))
      .filter(field => !field.endsWith('_id'))
      .filter(field => !(event.reason && REASON_FIELDS.has(field)))
      .filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .slice(0, 12)
      .map(field => ({
        field,
        before: this.formatValue(field, before[field]),
        after: this.formatValue(field, event.operation === 'DELETE' ? before[field] : after[field]),
      }));
  }

  protected detailHeading(event: AuditEvent): string {
    if (event.operation === 'INSERT') return 'Recorded details';
    if (event.operation === 'DELETE') return 'Deleted record';
    return 'What changed';
  }

  protected actorName(event: AuditEvent): string {
    if (event.actor_id && event.actor_id === this.supabase.session()?.user.id) return 'You';
    if (event.actor_phone) return this.maskPhone(event.actor_phone);
    return event.actor_role ? `${event.actor_role} user` : 'System';
  }

  protected actorOption(person: AuditActor): string {
    if (person.user_id === this.supabase.session()?.user.id)
      return `You · ${person.role_name ?? 'Team'}`;
    return `${person.phone ? this.maskPhone(person.phone) : `User …${person.user_id.slice(-6)}`} · ${person.role_name ?? 'Team'}`;
  }

  protected areaLabel(area: string): string {
    return (
      (
        {
          sales: 'Sales',
          inventory: 'Inventory',
          cash: 'Cash control',
          people: 'Customers',
          team: 'Team',
          settings: 'Settings',
        } as Record<string, string>
      )[area] ?? area
    );
  }

  protected areaRoute(area: string): string | null {
    if (area === 'cash' && !this.permissions.has('ViewFinancials')) return null;
    if (area === 'team' && !this.permissions.has('ManageTeam')) return null;
    return (
      (
        {
          sales: '/sales',
          inventory: '/products',
          cash: '/money/cashier',
          people: '/customers',
          team: '/team',
          settings: '/settings',
        } as Record<string, string>
      )[area] ?? '/dashboard'
    );
  }

  protected eventIcon(event: AuditEvent): string {
    if (event.event_source === 'inventory') return 'heroCube';
    if (event.area === 'sales') return 'heroClipboardDocumentList';
    if (event.area === 'team' || event.area === 'people') return 'heroUsers';
    if (event.area === 'cash') return 'heroBanknotes';
    return 'heroCog6Tooth';
  }

  protected fieldLabel(field: string): string {
    return (
      FIELD_LABELS[field] ?? field.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())
    );
  }

  protected relativeTime(value: string): string {
    const elapsed = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
      new Date(value)
    );
  }

  protected dateTime(value: string): string {
    return new Intl.DateTimeFormat('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private async loadActors(): Promise<void> {
    try {
      this.actors.set(await this.audit.actors());
    } catch {
      this.actors.set([]);
    }
  }

  private reloadFromStart(): void {
    this.page.set(1);
    void this.load();
  }

  private fromDate(): string | null {
    const period = this.period();
    if (!period) return null;
    const date = new Date();
    if (period === 'today') date.setHours(0, 0, 0, 0);
    else date.setDate(date.getDate() - Number(period));
    return date.toISOString();
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.length > 4 ? `••• ${digits.slice(-4)}` : phone;
  }

  private stockQuantitySummary(event: AuditEvent): string {
    const data = this.asRecord(event.after_data);
    const previous = data['previous_quantity'];
    const next = data['new_quantity'];
    if (typeof previous === 'number' && typeof next === 'number') {
      return `${previous} → ${next} units`;
    }
    const quantity = data['quantity'];
    if (typeof quantity === 'number') {
      return `${quantity > 0 ? '+' : ''}${quantity} units`;
    }
    return '';
  }

  private asRecord(value: Json): Record<string, Json | undefined> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private formatValue(field: string, value: Json | undefined): string {
    if (value === undefined || value === null || value === '') return '—';
    if (/password|secret|token|key/i.test(field)) return 'Hidden';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number' && /amount|balance|cost|credit_limit|price|total/.test(field)) {
      return formatKes(value);
    }
    if (Array.isArray(value))
      return (
        value
          .map(item => this.text(item))
          .filter(Boolean)
          .join(', ') || '—'
      );
    if (typeof value === 'object') return 'Updated details';
    return String(value);
  }

  private text(value: Json | undefined): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}
