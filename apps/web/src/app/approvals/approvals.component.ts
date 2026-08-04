import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { PosService, variantLabel } from '../pos/pos.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { Approval, ApprovalsService } from './approvals.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';

type DecisionTarget = { approval: Approval; action: 'approve' | 'deny' };

const TYPE_BADGE: Record<string, string> = {
  below_wholesale: 'badge-warning',
  order_reversal: 'badge-error',
  overdraft: 'badge-info',
  customer_credit: 'badge-info',
  external_account_payment: 'badge-warning',
};

@Component({
  selector: 'app-approvals',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    EmptyStateComponent,
    PaginationComponent,
    ButtonComponent,
    DataTableShellComponent,
    FormFieldComponent,
    IconComponent,
    ListSearchBarComponent,
    StatBarComponent,
    StatusBadgeComponent,
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
                  <span class="type-caption">by User …{{ shortId(a.requested_by) }}</span>
                  <span class="type-caption">{{ age(a.created_at) }}</span>
                  <span class="ml-auto"></span>
                  <button appButton size="sm" [disabled]="busy()" (click)="decide(a, 'approve')">
                    Approve
                  </button>
                  <button
                    appButton
                    variant="error"
                    size="sm"
                    [disabled]="busy()"
                    (click)="decide(a, 'deny')"
                  >
                    Deny
                  </button>
                </div>
                <p class="mt-1 text-sm">{{ summary(a) }}</p>

                @if (deciding(); as d) {
                  @if (d.approval.id === a.id) {
                    <form
                      (submit)="$event.preventDefault(); confirmDecision()"
                      class="mt-2 flex flex-wrap items-end gap-2 rounded-field bg-base-200 p-2"
                    >
                      <app-form-field
                        class="flex-1"
                        [label]="'Reason ' + (d.action === 'deny' ? '(required)' : '(optional)')"
                      >
                        <input
                          type="text"
                          class="input input-bordered input-sm"
                          [formControl]="decisionReason"
                        />
                      </app-form-field>
                      <button
                        appButton
                        type="submit"
                        size="sm"
                        [variant]="d.action === 'approve' ? 'primary' : 'error'"
                        [disabled]="
                          busy() ||
                          (d.action === 'deny' && decisionReason.value.trim().length === 0)
                        "
                      >
                        Confirm {{ d.action }}
                      </button>
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        (click)="deciding.set(null)"
                      >
                        Cancel
                      </button>
                    </form>
                  }
                }
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
                    <td class="font-mono text-xs">User …{{ shortId(a.requested_by) }}</td>
                    <td class="table-actions">
                      <button
                        appButton
                        size="sm"
                        [disabled]="busy()"
                        (click)="decide(a, 'approve')"
                      >
                        Approve
                      </button>
                      <button
                        appButton
                        variant="error"
                        size="sm"
                        class="ml-1"
                        [disabled]="busy()"
                        (click)="decide(a, 'deny')"
                      >
                        Deny
                      </button>
                    </td>
                  </tr>
                  @if (deciding(); as d) {
                    @if (d.approval.id === a.id) {
                      <tr class="row-detail">
                        <td colspan="5">
                          <form
                            (submit)="$event.preventDefault(); confirmDecision()"
                            class="flex items-end gap-2"
                          >
                            <app-form-field
                              class="flex-1"
                              [label]="
                                'Reason ' + (d.action === 'deny' ? '(required)' : '(optional)')
                              "
                            >
                              <input
                                type="text"
                                class="input input-bordered input-sm w-full"
                                [formControl]="decisionReason"
                              />
                            </app-form-field>
                            <button
                              appButton
                              type="submit"
                              size="sm"
                              [variant]="d.action === 'approve' ? 'primary' : 'error'"
                              [disabled]="
                                busy() ||
                                (d.action === 'deny' && decisionReason.value.trim().length === 0)
                              "
                            >
                              Confirm {{ d.action }}
                            </button>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              (click)="deciding.set(null)"
                            >
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    }
                  }
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
                  <td class="type-caption">User …{{ shortId(a.decided_by) }}</td>
                  <td class="text-xs text-base-content/60">{{ a.decision_reason ?? '—' }}</td>
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
    </app-page>
  `,
})
export class ApprovalsComponent implements OnInit {
  protected readonly approvals = inject(ApprovalsService);
  private readonly pos = inject(PosService);

  protected readonly deciding = signal<DecisionTarget | null>(null);
  protected readonly decisionReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly query = signal('');
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
      value: this.approvals.pending().filter(approval => approval.type === 'order_reversal').length,
      tone: 'error' as const,
    },
    { label: 'Recent decisions', value: this.approvals.decided().length },
  ]);

  private readonly orderCodeMap = signal<Map<string, string>>(new Map());
  private readonly variantLabelMap = signal<Map<string, string>>(new Map());

  async ngOnInit(): Promise<void> {
    await this.refresh();
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
    if (!query) return rows;
    return rows.filter(approval =>
      [
        this.typeLabel(approval.type),
        this.summary(approval),
        approval.status,
        approval.requested_by ?? '',
        approval.decision_reason ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  /** Resolve order codes + variant labels referenced by pending metadata. */
  private async loadSummaries(): Promise<void> {
    try {
      const orderIds = [
        ...new Set(
          this.approvals
            .pending()
            .map(a => (a.metadata as { order_id?: string })?.order_id)
            .filter((id): id is string => !!id)
        ),
      ];
      this.orderCodeMap.set(await this.approvals.orderCodes(orderIds));

      const variantIds = [
        ...new Set(
          this.approvals
            .pending()
            .filter(a => a.type === 'below_wholesale')
            .flatMap(a => {
              const lines = (a.metadata as { lines?: { variant_id?: string }[] })?.lines ?? [];
              return lines.map(l => l.variant_id).filter((id): id is string => !!id);
            })
        ),
      ];
      const variants = await this.pos.variantsByIds(variantIds);
      this.variantLabelMap.set(new Map(variants.map(v => [v.variant_id!, variantLabel(v)])));
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
    };
    const code = meta.order_id ? this.orderCode(meta.order_id) : null;
    switch (a.type) {
      case 'order_reversal':
        return `Void ${code ?? 'order'}${meta.reason ? ` — ${meta.reason}` : ''}`;
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
        return `Credit sale ${code ?? ''} of ${formatKes(meta.order_total ?? 0)} — balance ${formatKes(meta.ar_balance ?? 0)} vs limit ${formatKes(meta.credit_limit ?? 0)}`;
      default:
        return code ?? a.type;
    }
  }

  protected decide(approval: Approval, action: 'approve' | 'deny'): void {
    this.deciding.set({ approval, action });
    this.decisionReason.setValue('');
  }

  protected async confirmDecision(): Promise<void> {
    const target = this.deciding();
    if (!target) return;
    const reason = this.decisionReason.value.trim();
    if (target.action === 'deny' && reason.length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      if (target.action === 'approve') {
        await this.approvals.approve(target.approval.id, reason || undefined);
      } else {
        await this.approvals.deny(target.approval.id, reason);
      }
      this.notice.set(`${this.typeLabel(target.approval.type)} request ${target.action}d`);
      this.deciding.set(null);
      await this.loadSummaries();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected shortId(userId: string | null): string {
    return userId ? userId.slice(-4) : '????';
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
}
