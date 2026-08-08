import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { formatKes } from '../core/money';
import { PosService, variantLabel } from '../pos/pos.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { Approval, ApprovalsService } from './approvals.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../shared/ui/list-search-bar.component';
import { sortList } from '../shared/ui/list-sort';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import {
  ApprovalDecisionResult,
  ApprovalReviewDrawerComponent,
} from './approval-review-drawer.component';

const APPROVAL_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'date', label: 'Activity date' },
  { value: 'type', label: 'Request type' },
  { value: 'status', label: 'Decision status' },
  { value: 'requester', label: 'Requested by' },
];

const TYPE_BADGE: Record<string, string> = {
  below_wholesale: 'badge-warning',
  order_reversal: 'badge-error',
  overdraft: 'badge-info',
  customer_credit: 'badge-info',
  external_account_payment: 'badge-warning',
  sale_refund: 'badge-warning',
  payment_reversal: 'badge-error',
};

@Component({
  selector: 'app-approvals',
  imports: [
    PageLayoutComponent,
    EmptyStateComponent,
    PaginationComponent,
    ButtonComponent,
    DataTableShellComponent,
    IconComponent,
    ListSearchBarComponent,
    StatBarComponent,
    StatusBadgeComponent,
    ApprovalReviewDrawerComponent,
  ],
  template: `
    <app-page
      title="Approvals"
      subtitle="Review price exceptions, reversals, overdrafts, and other controlled actions."
      [badge]="approvals.pending().length"
      [wide]="true"
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh approvals"
        aria-label="Refresh approvals"
        (click)="refresh()"
      >
        <app-icon name="heroArrowPath" />
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

      <div class="type-caption mb-4 grid gap-1 rounded-box bg-base-100 p-3 md:grid-cols-3">
        <p>
          <span class="font-semibold">below wholesale</span> — a price below wholesale needs
          sign-off.
        </p>
        <p><span class="font-semibold">order reversal</span> — a void needs sign-off.</p>
        <p><span class="font-semibold">sale refund</span> — a refund needs sign-off.</p>
        <p>
          <span class="font-semibold">payment reversal</span> — a settled payment needs sign-off.
        </p>
        <p>
          <span class="font-semibold">overdraft</span> — a record of who authorized credit over the
          limit.
        </p>
        <p>
          <span class="font-semibold">direct account payment</span> — a sale tendered to a non-till
          account needs finance sign-off.
        </p>
      </div>

      <app-list-search-bar
        placeholder="Search request type, order, or details…"
        [searchQuery]="query()"
        (searchQueryChange)="query.set($event); pendingPage.set(1); decidedPage.set(1)"
        [sortOptions]="approvalSortOptions"
        [sortKey]="approvalSort()"
        (sortKeyChange)="approvalSort.set($event); pendingPage.set(1); decidedPage.set(1)"
        [sortDirection]="approvalSortDirection()"
        (sortDirectionChange)="
          approvalSortDirection.set($event); pendingPage.set(1); decidedPage.set(1)
        "
      >
        <app-stat-bar summary [stats]="approvalStats()" />
      </app-list-search-bar>

      <!-- Pending inbox -->
      @if (filteredPending().length === 0) {
        <app-empty-state
          [compact]="query().length > 0"
          icon="heroCheckCircle"
          [title]="query().length > 0 ? 'No matching pending requests' : 'Inbox zero'"
          description="Nothing waiting for a decision. Void and below-wholesale requests land here."
        />
      } @else {
        <div class="flex flex-col gap-2 lg:hidden">
          @for (a of pagedPending(); track a.id) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <span class="badge" [class]="typeBadge(a.type)">{{ typeLabel(a.type) }}</span>
                  <span class="type-caption">by {{ personName(a.requested_by) }}</span>
                  <span class="type-caption">{{ age(a.created_at) }}</span>
                  <span class="ml-auto"></span>
                  <button appButton size="sm" (click)="openReview(a)">Review</button>
                </div>
                <p class="mt-1 text-sm">{{ summary(a) }}</p>
              </div>
            </div>
          }
        </div>

        <div class="hidden lg:block">
          <app-data-table-shell
            title="Pending decisions"
            [description]="filteredPending().length + ' awaiting review'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Type</th>
                  <th>Request</th>
                  <th>Requested by</th>
                  <th class="text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                @for (a of pagedPending(); track a.id) {
                  <tr>
                    <td>{{ age(a.created_at) }}</td>
                    <td>
                      <span class="badge badge-xs" [class]="typeBadge(a.type)">
                        {{ typeLabel(a.type) }}
                      </span>
                    </td>
                    <td class="max-w-xl">{{ summary(a) }}</td>
                    <td class="text-xs">{{ personName(a.requested_by) }}</td>
                    <td class="table-actions">
                      <button appButton size="sm" (click)="openReview(a)">Review</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="mt-3">
          <app-pagination
            [currentPage]="pendingPage()"
            [totalPages]="pendingTotalPages()"
            [totalItems]="filteredPending().length"
            [itemsPerPage]="pageSize()"
            itemLabel="requests"
            (pageChange)="pendingPage.set($event)"
          />
        </div>
      }

      <!-- Decided -->
      <h2 class="type-heading mt-6">Decision history</h2>
      @if (filteredDecided().length === 0) {
        <p class="mt-2 text-sm text-base-content/60">No decisions yet.</p>
      } @else {
        <app-data-table-shell
          class="mt-2 block"
          title="Decided requests"
          [description]="filteredDecided().length + ' recent decisions'"
        >
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Type</th>
                <th>Summary</th>
                <th>Status</th>
                <th>Decided by</th>
                <th>Reason</th>
                <th class="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              @for (a of pagedDecided(); track a.id) {
                <tr>
                  <td>
                    <span class="badge badge-xs" [class]="typeBadge(a.type)">{{
                      typeLabel(a.type)
                    }}</span>
                  </td>
                  <td class="text-sm">{{ summary(a) }}</td>
                  <td>
                    <app-status-badge
                      size="xs"
                      [type]="a.status === 'approved' ? 'success' : 'error'"
                      [label]="a.status"
                    />
                  </td>
                  <td class="type-caption">{{ personName(a.decided_by) }}</td>
                  <td class="text-xs text-base-content/60">{{ a.decision_reason ?? '—' }}</td>
                  <td class="table-actions">
                    <button appButton variant="ghost" size="sm" (click)="openReview(a)">
                      View
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div tableFooter>
            <app-pagination
              [currentPage]="decidedPage()"
              [totalPages]="decidedTotalPages()"
              [totalItems]="filteredDecided().length"
              [itemsPerPage]="pageSize()"
              itemLabel="decisions"
              (pageChange)="decidedPage.set($event)"
            />
          </div>
        </app-data-table-shell>
      }

      @if (selectedApproval(); as approval) {
        <app-approval-review-drawer
          [approval]="approval"
          (closed)="closeReview()"
          (decided)="decisionCompleted($event)"
        />
      }
    </app-page>
  `,
})
export class ApprovalsComponent implements OnInit {
  protected readonly approvals = inject(ApprovalsService);
  private readonly pos = inject(PosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeReady = signal(false);

  protected readonly selectedApproval = signal<Approval | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly approvalSortOptions = APPROVAL_SORT_OPTIONS;
  protected readonly approvalSort = signal('date');
  protected readonly approvalSortDirection = signal<ListSortDirection>('desc');
  protected readonly pageSize = signal(10);
  protected readonly pendingPage = signal(1);
  protected readonly decidedPage = signal(1);
  protected readonly filteredPending = computed(() => this.filterRows(this.approvals.pending()));
  protected readonly filteredDecided = computed(() => this.filterRows(this.approvals.decided()));
  protected readonly pendingTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPending().length / this.pageSize()))
  );
  protected readonly decidedTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredDecided().length / this.pageSize()))
  );
  protected readonly pagedPending = computed(() => {
    const page = Math.min(this.pendingPage(), this.pendingTotalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredPending().slice(start, start + this.pageSize());
  });
  protected readonly pagedDecided = computed(() => {
    const page = Math.min(this.decidedPage(), this.decidedTotalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredDecided().slice(start, start + this.pageSize());
  });
  protected readonly approvalStats = computed(() => [
    {
      label: 'Pending',
      value: this.approvals.pending().length,
      tone: 'warning' as const,
    },
    {
      label: 'Price exceptions',
      value: this.approvals.pending().filter(approval => approval.type === 'below_wholesale')
        .length,
    },
    {
      label: 'Reversals',
      value: this.approvals
        .pending()
        .filter(approval =>
          ['order_reversal', 'sale_refund', 'payment_reversal'].includes(approval.type)
        ).length,
      tone: 'error' as const,
    },
    { label: 'Recent decisions', value: this.approvals.decided().length },
  ]);

  private readonly orderCodeMap = signal<Map<string, string>>(new Map());
  private readonly variantLabelMap = signal<Map<string, string>>(new Map());
  private readonly customerNameMap = signal<Map<string, string>>(new Map());
  private readonly staffNameMap = signal<Map<string, string>>(new Map());
  private routeLoadSequence = 0;

  constructor() {
    effect(() => {
      const params = this.routeParams();
      if (!this.routeReady()) return;
      untracked(() => void this.openRouteApproval(params.get('approval')));
    });
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.routeReady.set(true);
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.approvals.refresh();
      await this.loadSummaries();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      this.loading.set(false);
    }
  }

  private filterRows(rows: Approval[]): Approval[] {
    const query = this.query().trim().toLowerCase();
    const filtered = query
      ? rows.filter(approval =>
          [
            this.typeLabel(approval.type),
            this.summary(approval),
            approval.status,
            this.personName(approval.requested_by),
            approval.requested_by ?? '',
            approval.decision_reason ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)
        )
      : rows;
    const sortKey = this.approvalSort();
    return sortList(
      filtered,
      this.approvalSortDirection(),
      approval => {
        switch (sortKey) {
          case 'type':
            return this.typeLabel(approval.type);
          case 'status':
            return approval.status;
          case 'requester':
            return approval.requested_by;
          default:
            return approval.decided_at ?? approval.created_at;
        }
      },
      approval => approval.created_at
    );
  }

  /** Resolve order codes + variant labels referenced by pending metadata. */
  private async loadSummaries(): Promise<void> {
    try {
      const rows = [...this.approvals.pending(), ...this.approvals.decided()];
      const orderIds = [
        ...new Set(
          rows
            .map(a => (a.metadata as { order_id?: string })?.order_id)
            .filter((id): id is string => !!id)
        ),
      ];
      this.orderCodeMap.set(await this.approvals.orderCodes(orderIds));

      const customerIds = [
        ...new Set(
          rows
            .filter(approval => approval.type === 'customer_credit')
            .map(approval => approval.subject_id)
            .filter((id): id is string => !!id)
        ),
      ];
      this.customerNameMap.set(await this.approvals.customerNames(customerIds));

      const variantIds = [
        ...new Set(
          rows
            .filter(a => a.type === 'below_wholesale')
            .flatMap(a => {
              const lines = (a.metadata as { lines?: { variant_id?: string }[] })?.lines ?? [];
              return lines.map(l => l.variant_id).filter((id): id is string => !!id);
            })
        ),
      ];
      const variants = await this.pos.variantsByIds(variantIds);
      this.variantLabelMap.set(
        new Map(
          variants.map(v => [
            v.variant_id!,
            `${variantLabel(v)} · ${v.manufacturer_name || 'Manufacturer not set'}`,
          ])
        )
      );
      this.staffNameMap.set(
        await this.approvals.staffNames(
          rows.flatMap(approval => [approval.requested_by, approval.decided_by])
        )
      );
    } catch {
      // summaries fall back to raw ids
    }
  }

  protected typeBadge(type: string): string {
    return TYPE_BADGE[type] ?? 'badge-outline';
  }

  protected typeLabel(type: string): string {
    if (type === 'external_account_payment') return 'Direct account payment';
    return type.replace(/_/g, ' ');
  }

  protected summary(a: Approval): string {
    const meta = a.metadata as Record<string, unknown> & {
      order_id?: string;
      reason?: string;
      lines?: { variant_id: string; custom_price: number; reason?: string }[];
      tenders?: { method: string; amount: number; reference?: string | null }[];
      ar_balance?: number;
      order_total?: number;
      credit_limit?: number;
      payment_id?: string;
      amount?: number;
      method_code?: string;
      projected_balance?: number;
      previous?: { credit_limit: number; is_credit_approved: boolean; credit_terms_days: number };
      proposed?: { credit_limit: number; is_credit_approved: boolean; credit_terms_days: number };
    };
    const code = meta.order_id ? this.orderCode(meta.order_id) : null;
    switch (a.type) {
      case 'order_reversal':
        return `Void ${code ?? 'order'}${meta.reason ? ` — ${meta.reason}` : ''}`;
      case 'sale_refund':
        return `Refund ${formatKes(meta.amount ?? 0)} from ${code ?? 'order'} via ${meta.method_code ?? 'payment method'}${meta.reason ? ` — ${meta.reason}` : ''}`;
      case 'payment_reversal':
        return `Reverse payment …${meta.payment_id?.slice(-8) ?? ''} on ${code ?? 'order'}${meta.reason ? ` — ${meta.reason}` : ''}`;
      case 'external_account_payment': {
        const tenders = (meta.tenders ?? [])
          .map(
            t => `${t.method} ${formatKes(t.amount)}${t.reference ? ` (ref ${t.reference})` : ''}`
          )
          .join(', ');
        return `Direct account payment on ${code ?? 'order'} — ${tenders}`;
      }
      case 'below_wholesale': {
        const lines = (meta.lines ?? [])
          .map(
            l =>
              `${this.variantLabelMap().get(l.variant_id) ?? l.variant_id.slice(0, 8)} at ${formatKes(l.custom_price)}`
          )
          .join(', ');
        return `Below-wholesale sale ${code ?? ''} — ${lines}`;
      }
      case 'overdraft':
        return `Credit sale ${code ?? ''} of ${formatKes(meta.order_total ?? 0)} — projected ${formatKes(meta.projected_balance ?? (meta.ar_balance ?? 0) + (meta.order_total ?? 0))} vs limit ${formatKes(meta.credit_limit ?? 0)}`;
      case 'customer_credit': {
        const customer = a.subject_id
          ? (this.customerNameMap().get(a.subject_id) ?? `customer …${a.subject_id.slice(-8)}`)
          : 'customer';
        return `Change ${customer} to ${meta.proposed?.is_credit_approved ? 'approved' : 'not approved'}, ${formatKes(meta.proposed?.credit_limit ?? 0)} limit, ${meta.proposed?.credit_terms_days ?? 0}d terms${meta.reason ? ` — ${meta.reason}` : ''}`;
      }
      default:
        return code ?? a.type;
    }
  }

  protected openReview(approval: Approval, updateUrl = true): void {
    this.selectedApproval.set(approval);
    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { approval: approval.id },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  protected closeReview(updateUrl = true): void {
    this.selectedApproval.set(null);
    if (!updateUrl) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { approval: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected async decisionCompleted(result: ApprovalDecisionResult): Promise<void> {
    const outcome =
      result.status === 'expired'
        ? 'expired because the action is no longer valid'
        : result.action === 'approve'
          ? 'approved'
          : 'denied';
    this.notice.set(
      `${this.typeLabel(result.approval.type)} request ${outcome}. Requester notified.`
    );
    this.closeReview();
    await this.loadSummaries();
  }

  protected shortId(userId: string | null): string {
    return userId ? userId.slice(-4) : '????';
  }

  protected personName(userId: string | null): string {
    if (!userId) return 'Unknown user';
    return this.staffNameMap().get(userId) ?? `User …${this.shortId(userId)}`;
  }

  protected age(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  private orderCode(orderId: string): string {
    return this.orderCodeMap().get(orderId) ?? orderId.slice(0, 8);
  }

  private async openRouteApproval(approvalId: string | null): Promise<void> {
    const sequence = ++this.routeLoadSequence;
    if (!approvalId) {
      if (this.selectedApproval()) this.closeReview(false);
      return;
    }
    if (this.selectedApproval()?.id === approvalId) return;
    try {
      const approval = await this.approvals.byId(approvalId);
      if (sequence === this.routeLoadSequence) this.openReview(approval, false);
    } catch (error) {
      if (sequence !== this.routeLoadSequence) return;
      this.error.set(error instanceof Error ? error.message : 'Approval request not found');
    }
  }
}
