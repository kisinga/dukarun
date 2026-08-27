import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { formatKes } from '../../core/money';
import {
  CheckoutPanelComponent,
  type PaymentMethodOption,
} from '../checkout/checkout-panel.component';
import { OrderLineWithProduct, OrderWithCustomer, PaymentInput, PosService } from '../pos.service';
import { PermissionsService } from '../../core/permissions.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OrderQueueCountsService } from '../order-queue-counts.service';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../../shared/ui/list-search-bar.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { Approval, ApprovalsService } from '../../approvals/approvals.service';
import { DocumentSendComponent } from '../../communications/document-send.component';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../../shared/ui/page-actions.component';
import { MpesaService } from '../../core/mpesa.service';
import { MpesaCheckoutCoordinator } from '../../core/mpesa-checkout-coordinator.service';

const PROFORMA_STATUSES = ['draft', 'expired'];

const PROFORMA_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'created_at', label: 'Created date' },
  { value: 'code', label: 'Proforma code' },
  { value: 'total', label: 'Proforma value' },
  { value: 'status', label: 'Status' },
];

@Component({
  selector: 'app-proformas',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CheckoutPanelComponent,
    PageLayoutComponent,
    EmptyStateComponent,
    SessionRequiredNoticeComponent,
    ButtonComponent,
    DeleteConfirmationModalComponent,
    IconComponent,
    ListSearchBarComponent,
    StatusBadgeComponent,
    PaginationComponent,
    StatBarComponent,
    FormFieldComponent,
    DataTableShellComponent,
    DrawerComponent,
    StatCardComponent,
    MoneyComponent,
    DocumentSendComponent,
    MobileListComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page
      title="Proformas"
      subtitle="Review saved sales, make changes, and convert them when the customer is ready."
      [badge]="orderQueueCounts.proformas()"
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
          title="Refresh proformas"
          aria-label="Refresh proformas"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <a primaryAction appButton routerLink="/pos/sell">
          <app-icon name="heroPlus" /> New proforma
        </a>
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div class="alert alert-success mb-3" aria-live="polite">
          <app-icon name="heroCheckCircle" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ notice() }}</p>
            @if (completedSale()) {
              <p class="text-sm">
                Payment is complete.
                {{ printerEnabled() ? 'The receipt is ready.' : 'The sale is finalized.' }}
              </p>
            }
          </div>
          @if (completedSale(); as completed) {
            @if (printerEnabled()) {
              <button
                appButton
                variant="outline"
                size="sm"
                [loading]="printing()"
                (click)="printReceipt(completed.id)"
              >
                <app-icon name="heroPrinter" />
                Print receipt
              </button>
            }
          }
        </div>
      }
      <app-list-search-bar
        placeholder="Search proforma code or customer…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
        [sortOptions]="proformaSortOptions"
        [sortKey]="proformaSort()"
        (sortKeyChange)="changeSort($event, proformaSortDirection())"
        [sortDirection]="proformaSortDirection()"
        (sortDirectionChange)="changeSort(proformaSort(), $event)"
        [filtersEnabled]="true"
        [activeFilterCount]="proformaFilterCount()"
        (clearFilters)="clearFilters()"
      >
        <app-stat-bar summary [stats]="proformaStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <app-form-field label="Status" class="lg:w-44">
            <select class="select select-bordered select-sm w-full" [formControl]="status">
              <option value="all">All proformas</option>
              <option value="draft">Active</option>
              <option value="expired">Expired</option>
            </select>
          </app-form-field>
          <app-form-field label="Created from" class="lg:w-40">
            <input type="date" class="input input-bordered input-sm w-full" [formControl]="from" />
          </app-form-field>
          <app-form-field label="Created to" class="lg:w-40">
            <input type="date" class="input input-bordered input-sm w-full" [formControl]="to" />
          </app-form-field>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button appButton type="button" (click)="applyFilters()">Apply filters</button>
            <button appButton variant="ghost" type="button" (click)="clearFilters()">Clear</button>
          </div>
        </div>
      </app-list-search-bar>

      @if (cashierSession.cashControlEnabled() && !cashierSession.isOpen() && activeOnPage() > 0) {
        <app-session-required-notice action="converting a proforma to a sale" />
      }

      @if (!loading() && proformas().length === 0) {
        <app-empty-state
          [compact]="query().length > 0"
          icon="heroClipboardDocumentList"
          [title]="
            query().length > 0 ? 'No matching proformas' : 'No proformas match these filters'
          "
          description="Clear the filters, or start a new proforma from the Sell screen."
          ctaLabel="New proforma"
          ctaLink="/pos/sell"
        />
      } @else {
        <app-mobile-list>
          @for (draft of proformas(); track draft.id) {
            <div
              mobileListRow
              class="cursor-pointer"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedDraftId() === draft.id"
              (click)="openPreview(draft.id)"
              (keydown.enter)="openPreview(draft.id)"
            >
              <div class="p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono font-semibold">{{ draft.code }}</span>
                      <app-status-badge
                        size="xs"
                        [type]="draft.status === 'expired' ? 'error' : 'info'"
                        [label]="draft.status === 'expired' ? 'Expired' : 'Active'"
                      />
                      @if (draftApproval(draft.id); as approval) {
                        <app-status-badge
                          size="xs"
                          [type]="approvalTone(approval.status)"
                          [label]="approvalLabel(approval)"
                        />
                      }
                    </div>
                    <p class="type-caption mt-1">
                      {{ customerName(draft) }} · {{ time(draft.created_at) }}
                    </p>
                    <p
                      class="mt-1 text-xs"
                      [class.text-error]="draft.status === 'expired'"
                      [class.text-base-content]="draft.status !== 'expired'"
                    >
                      {{ validityLabel(draft) }}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-bold tabular-nums"><app-money [amount]="draft.total" /></p>
                    @if (draft.status === 'draft') {
                      <button
                        appButton
                        size="sm"
                        class="mt-2"
                        [disabled]="
                          !cashierSession.canTakePayment() ||
                          busy() ||
                          draftApproval(draft.id)?.status === 'pending'
                        "
                        (click)="$event.stopPropagation(); startConversion(draft)"
                      >
                        {{
                          draftApproval(draft.id)?.status === 'approved'
                            ? 'Continue checkout'
                            : 'Convert to sale'
                        }}
                        <app-icon name="heroArrowRight" />
                      </button>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </app-mobile-list>

        <div class="hidden lg:block">
          <app-data-table-shell
            heading="Saved proformas"
            [description]="
              totalItems() + ' matching ' + (totalItems() === 1 ? 'proforma' : 'proformas')
            "
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Proforma</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Validity</th>
                  <th class="text-right">Total</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (draft of proformas(); track draft.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.table-row-active]="selectedDraftId() === draft.id"
                    (click)="openPreview(draft.id)"
                    (keydown.enter)="openPreview(draft.id)"
                  >
                    <td>{{ time(draft.created_at) }}</td>
                    <td class="font-mono font-semibold">{{ draft.code }}</td>
                    <td>{{ customerName(draft) }}</td>
                    <td>
                      <app-status-badge
                        size="xs"
                        [type]="draft.status === 'expired' ? 'error' : 'info'"
                        [label]="draft.status === 'expired' ? 'Expired' : 'Active'"
                      />
                      @if (draftApproval(draft.id); as approval) {
                        <app-status-badge
                          class="ml-1"
                          size="xs"
                          [type]="approvalTone(approval.status)"
                          [label]="approvalLabel(approval)"
                        />
                      }
                    </td>
                    <td [class.text-error]="draft.status === 'expired'">
                      {{ validityLabel(draft) }}
                    </td>
                    <td class="table-number"><app-money [amount]="draft.total" /></td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      @if (draft.status === 'draft') {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Edit proforma"
                          aria-label="Edit proforma"
                          (click)="edit(draft.id)"
                        >
                          <app-icon name="heroPencilSquare" />
                        </button>
                        @if (printerEnabled()) {
                          <button
                            appButton
                            variant="ghost"
                            [iconOnly]="true"
                            title="Print proforma"
                            aria-label="Print proforma"
                            [disabled]="printing()"
                            (click)="printProforma(draft.id)"
                          >
                            <app-icon name="heroPrinter" />
                          </button>
                        }
                      }
                      <button
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        class="text-error"
                        title="Delete proforma"
                        aria-label="Delete proforma"
                        [disabled]="busy()"
                        (click)="startDelete(draft)"
                      >
                        <app-icon name="heroXMark" />
                      </button>
                      @if (draft.status === 'draft') {
                        <button
                          appButton
                          size="sm"
                          class="ml-2"
                          [disabled]="
                            !cashierSession.canTakePayment() ||
                            busy() ||
                            draftApproval(draft.id)?.status === 'pending'
                          "
                          (click)="startConversion(draft)"
                        >
                          {{
                            draftApproval(draft.id)?.status === 'approved'
                              ? 'Continue checkout'
                              : 'Convert to sale'
                          }}
                          <app-icon name="heroArrowRight" />
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="totalItems()"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="proformas"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
      <!-- Proforma preview drawer (read-only; edit stays in the Sell workspace) -->
      @if (selectedDraft(); as draft) {
        <app-drawer
          [open]="true"
          (closed)="closePreview()"
          [title]="draft.code"
          [subtitle]="customerName(draft) + ' · ' + time(draft.created_at)"
        >
          @if (draft.status === 'draft') {
            <button
              drawerActions
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Edit proforma"
              aria-label="Edit proforma"
              (click)="editFromPreview(draft)"
            >
              <app-icon name="heroPencilSquare" />
            </button>
          }
          @if (draft.status === 'draft' && printerEnabled()) {
            <button
              drawerActions
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Print proforma"
              aria-label="Print proforma"
              [disabled]="printing()"
              (click)="printProforma(draft.id)"
            >
              <app-icon name="heroPrinter" />
            </button>
          }
          <button
            drawerActions
            appButton
            variant="ghost"
            [iconOnly]="true"
            type="button"
            class="text-error"
            title="Delete proforma"
            aria-label="Delete proforma"
            [disabled]="busy()"
            (click)="deleteFromPreview(draft)"
          >
            <app-icon name="heroXMark" />
          </button>

          <div class="flex flex-wrap items-center gap-1">
            <app-status-badge
              size="xs"
              [type]="draft.status === 'expired' ? 'error' : 'info'"
              [label]="draft.status === 'expired' ? 'Expired' : 'Active'"
            />
            @if (draftApproval(draft.id); as approval) {
              <app-status-badge
                size="xs"
                [type]="approvalTone(approval.status)"
                [label]="approvalLabel(approval)"
              />
            }
            <span class="type-caption">{{ validityLabel(draft) }}</span>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <app-stat-card label="Total" [value]="fmtKes(draft.total)" />
            <app-stat-card label="Items" [value]="previewLines().length + ' line(s)'" />
          </div>

          @if (draft.status === 'draft' && draft.customer_id && canSendDocuments()) {
            <app-document-send
              class="mt-3 block"
              documentType="proforma"
              [subjectId]="draft.id"
              title="Send proforma"
              description="A read-only snapshot is shared through a secure link."
              (sent)="notice.set($event)"
              (failed)="error.set($event)"
            />
          }

          @if (previewLoading()) {
            <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
              <span class="loading loading-spinner loading-md"></span>
              <span class="text-sm">Loading proforma…</span>
            </div>
          } @else {
            <div class="mt-4 flex flex-col gap-4">
              <section>
                <h3 class="section-title mb-2">Items</h3>
                @if (previewLines().length === 0) {
                  <app-empty-state [compact]="true" icon="heroShoppingCart" title="No line items" />
                } @else {
                  <ul class="divide-y divide-base-200">
                    @for (line of previewLines(); track line.id) {
                      <li class="flex items-center gap-3 py-2">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium">{{ line.label }}</p>
                          <p class="type-caption">
                            {{ line.manufacturer_name || 'Manufacturer not set' }}
                            @if (line.sku) {
                              · {{ line.sku }}
                            }
                            ·
                            {{ line.quantity }} ×
                            <app-money [amount]="line.custom_price ?? line.unit_price" />
                          </p>
                        </div>
                        <span class="text-sm font-semibold tabular-nums">
                          <app-money [amount]="line.line_total" />
                        </span>
                      </li>
                    }
                  </ul>
                }
              </section>

              @if (draft.status === 'draft') {
                <section class="border-t border-base-300/60 pt-3">
                  @if (draftApproval(draft.id); as approval) {
                    <div
                      class="mb-3 rounded-field border border-base-300 p-3"
                      [class.ring-2]="highlightedApprovalId() === approval.id"
                      [class.ring-primary]="highlightedApprovalId() === approval.id"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-sm font-semibold">{{ approvalLabel(approval) }}</p>
                        <a
                          appButton
                          variant="ghost"
                          size="sm"
                          [routerLink]="['/approvals']"
                          [queryParams]="{ approval: approval.id }"
                          >View request</a
                        >
                      </div>
                      @if (approval.decision_reason) {
                        <p class="type-caption mt-1">{{ approval.decision_reason }}</p>
                      }
                    </div>
                  }
                  @if (cashierSession.cashControlEnabled() && !cashierSession.isOpen()) {
                    <app-session-required-notice action="converting a proforma to a sale" />
                  }
                  <button
                    appButton
                    size="sm"
                    [disabled]="
                      !cashierSession.canTakePayment() ||
                      busy() ||
                      draftApproval(draft.id)?.status === 'pending'
                    "
                    (click)="convertFromPreview(draft)"
                  >
                    {{
                      draftApproval(draft.id)?.status === 'approved'
                        ? 'Continue checkout'
                        : 'Convert to sale'
                    }}
                    <app-icon name="heroArrowRight" />
                  </button>
                </section>
              }
            </div>
          }
        </app-drawer>
      }

      @if (cashierSession.canTakePayment() && converting(); as draft) {
        <app-checkout-panel
          [total]="draft.total"
          [methods]="panelMethods()"
          [canUseDirectAccounts]="canUseDirectAccounts()"
          [mpesaStkEnabled]="mpesa.availability().active"
          [mpesaManualFallback]="mpesa.availability().manualFallback"
          [busy]="busy()"
          [heading]="'Convert ' + draft.code"
          (confirmed)="convert(draft.id, $event)"
          (approvalRequested)="directAccountRequested()"
          (cancelled)="converting.set(null)"
        />
      }
      @if (mpesaSplitReady(); as split) {
        <dialog class="modal modal-open">
          <div class="modal-box modal-box-scroll">
            <h2 class="type-title">M-PESA received</h2>
            <p class="mt-2 text-sm">Confirm the cash side only after it is in hand.</p>
            <p class="mt-4 text-xl font-semibold"><app-money [amount]="split.cashAmount" /></p>
            <div class="modal-action">
              <button appButton variant="ghost" (click)="mpesaSplitReady.set(null)">
                Keep pending</button
              ><button appButton [loading]="busy()" (click)="confirmMpesaCash()">
                Confirm cash received
              </button>
            </div>
          </div>
        </dialog>
      }
      @if (directAccountNotice()) {
        <div class="toast toast-bottom toast-end z-50" aria-live="polite">
          <div class="alert alert-warning max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Direct account payment needs finance sign-off</p>
              <p class="text-sm">
                Someone with finance access can settle it, or approve it from the
                <a routerLink="/approvals" class="link font-medium">Approvals inbox</a>.
              </p>
            </div>
          </div>
        </div>
      }

      <app-delete-confirmation-modal
        [data]="deleteData()"
        title="Delete proforma?"
        entityType="proforma"
        verb="delete"
        confirmButtonText="Delete proforma"
        (confirm)="confirmDelete()"
        (cancel)="deleting.set(null)"
      />
    </app-page>
  `,
})
export class ProformasComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly routeParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly routeReady = signal(false);
  private readonly approvals = inject(ApprovalsService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  private readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly orderQueueCounts = inject(OrderQueueCountsService);
  protected readonly mpesa = inject(MpesaService);
  private readonly mpesaCheckout = inject(MpesaCheckoutCoordinator);

  protected readonly proformas = signal<OrderWithCustomer[]>([]);
  protected readonly loading = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly query = signal('');
  protected readonly proformaSortOptions = PROFORMA_SORT_OPTIONS;
  protected readonly proformaSort = signal('created_at');
  protected readonly proformaSortDirection = signal<ListSortDirection>('desc');
  protected readonly status = new FormControl('all', { nonNullable: true });
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  protected readonly converting = signal<OrderWithCustomer | null>(null);
  protected readonly mpesaSplitReady = signal<{
    intentId: string;
    orderId: string;
    code: string;
    cashPayments: PaymentInput[];
    cashAmount: number;
  } | null>(null);
  private convertClientRef: string | null = null;
  private convertMpesaRetryAllowed = false;
  protected readonly deleting = signal<OrderWithCustomer | null>(null);
  protected readonly selectedDraftId = signal<string | null>(null);
  protected readonly highlightedApprovalId = signal<string | null>(null);
  protected readonly draftApprovals = signal<Map<string, Approval>>(new Map());
  protected readonly previewLines = signal<OrderLineWithProduct[]>([]);
  protected readonly previewLoading = signal(false);
  protected readonly fmtKes = formatKes;
  protected readonly methods = signal<PaymentMethodOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly completedSale = signal<{ id: string; code: string } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly directAccountNotice = signal(false);
  private directAccountTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
  protected readonly canSendDocuments = computed(() => this.perms.has('ManageCommunications'));
  /** Walk-in proformas may only be converted to till-controlled accounts. */
  protected readonly panelMethods = computed<PaymentMethodOption[]>(() => {
    const methods = this.methods();
    return this.converting()?.customer_id ? methods : methods.filter(m => m.isCashierControlled);
  });
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly activeOnPage = computed(
    () => this.proformas().filter(proforma => proforma.status === 'draft').length
  );
  protected readonly selectedDraft = computed(() => {
    const id = this.selectedDraftId();
    return id ? (this.proformas().find(draft => draft.id === id) ?? null) : null;
  });
  protected readonly proformaStats = computed(() => {
    const rows = this.proformas();
    return [
      {
        label: 'Matching proformas',
        value: this.totalItems(),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Active on page',
        value: this.activeOnPage(),
        tone: 'info' as const,
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Expired on page',
        value: rows.filter(proforma => proforma.status === 'expired').length,
        tone: 'error' as const,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Value on page',
        value: formatKes(rows.reduce((total, proforma) => total + proforma.total, 0)),
        mobilePriority: 'secondary' as const,
      },
    ];
  });
  protected readonly deleteData = computed(() => ({
    entityName: this.deleting()?.code ?? 'proforma',
    warningDetails: ['The proforma and its line items will be permanently removed.'],
  }));
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const params = this.routeParams();
      if (!this.routeReady()) return;
      untracked(() => void this.openRouteDraft(params.get('order'), params.get('approval')));
    });
  }

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    void this.mpesa.refreshAvailability();
    try {
      const methods = await this.pos.enabledPaymentMethods();
      this.methods.set(
        methods.map(m => ({
          code: m.code,
          name: m.name,
          isCashierControlled: m.is_cashier_controlled,
          reconciliationType: m.reconciliation_type ?? null,
          defaultAccountCode: m.default_account_code,
          accounts: m.accounts.map(account => ({
            code: account.code,
            name: account.name,
            isDefault: account.is_default,
          })),
        }))
      );
    } catch {
      // No methods configured yet; the panel will show an empty method list.
    }
    await this.load();
    this.routeReady.set(true);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.directAccountTimer) clearTimeout(this.directAccountTimer);
  }

  /**
   * convert_draft has no external-account approval path, so offer the
   * approvals inbox instead of silently settling a direct account.
   */
  protected directAccountRequested(): void {
    this.converting.set(null);
    if (this.directAccountTimer) clearTimeout(this.directAccountTimer);
    this.directAccountNotice.set(true);
    this.directAccountTimer = setTimeout(() => this.directAccountNotice.set(false), 6000);
  }

  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.pos.expireProformas();
      const statuses = this.status.value === 'all' ? PROFORMA_STATUSES : [this.status.value];
      const since = this.from.value
        ? new Date(`${this.from.value}T00:00:00`).toISOString()
        : undefined;
      let until: string | undefined;
      if (this.to.value) {
        const untilDate = new Date(`${this.to.value}T00:00:00`);
        untilDate.setDate(untilDate.getDate() + 1);
        until = untilDate.toISOString();
      }
      const result = await this.pos.ordersPage({
        statuses,
        since,
        until,
        search: this.query(),
        page: this.page(),
        pageSize: this.pageSize(),
        sortBy: this.proformaSort() as 'created_at' | 'code' | 'total' | 'status',
        sortDirection: this.proformaSortDirection(),
      });
      this.proformas.set(result.rows);
      this.totalItems.set(result.count);
      const approvals = await this.approvals.forOrders(result.rows.map(row => row.id));
      const latest = new Map<string, Approval>();
      for (const approval of approvals.filter(item => item.type === 'below_wholesale')) {
        const orderId =
          (approval.metadata as { order_id?: string }).order_id ?? approval.subject_id;
        if (orderId && !latest.has(orderId)) latest.set(orderId, approval);
      }
      this.draftApprovals.set(latest);
      this.error.set(null);
      void this.orderQueueCounts.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load proformas');
    } finally {
      this.loading.set(false);
    }
  }

  protected async applyFilters(): Promise<void> {
    this.page.set(1);
    await this.load();
  }

  protected proformaFilterCount(): number {
    return Number(this.status.value !== 'all') + Number(Boolean(this.from.value || this.to.value));
  }

  protected async clearFilters(): Promise<void> {
    this.query.set('');
    this.status.setValue('all');
    this.from.setValue('');
    this.to.setValue('');
    await this.applyFilters();
  }

  protected async changePage(page: number): Promise<void> {
    this.page.set(page);
    await this.load();
  }

  protected async changePageSize(size: number): Promise<void> {
    this.pageSize.set(size);
    this.page.set(1);
    await this.load();
  }

  protected changeSort(key: string, direction: ListSortDirection): void {
    this.proformaSort.set(key);
    this.proformaSortDirection.set(direction);
    this.page.set(1);
    void this.load();
  }

  protected async printProforma(orderId: string): Promise<void> {
    this.printing.set(true);
    this.error.set(null);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildProformaData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.printing.set(false);
    }
  }

  protected edit(orderId: string): void {
    void this.router.navigate(['/pos/sell'], { queryParams: { draft: orderId } });
  }

  protected async openPreview(orderId: string, updateUrl = true): Promise<void> {
    this.selectedDraftId.set(orderId);
    this.previewLines.set([]);
    this.previewLoading.set(true);
    try {
      const [lines, history] = await Promise.all([
        this.pos.orderLines(orderId),
        this.approvals.forOrder(orderId).catch(() => []),
      ]);
      // Ignore stale results when the drawer was closed (or reopened) meanwhile.
      if (this.selectedDraftId() !== orderId) return;
      this.previewLines.set(lines);
      const latest = history.find(item => item.type === 'below_wholesale');
      if (latest) this.draftApprovals.update(rows => new Map(rows).set(orderId, latest));
      if (updateUrl) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { order: orderId, approval: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load proforma lines');
    } finally {
      if (this.selectedDraftId() === orderId) this.previewLoading.set(false);
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closePreview(updateUrl = true): void {
    this.selectedDraftId.set(null);
    this.previewLoading.set(false);
    this.previewLines.set([]);
    this.highlightedApprovalId.set(null);
    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { order: null, approval: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /** Edit happens in the Sell workspace — close the preview first. */
  protected editFromPreview(draft: OrderWithCustomer): void {
    this.closePreview();
    this.edit(draft.id);
  }

  protected deleteFromPreview(draft: OrderWithCustomer): void {
    this.closePreview();
    this.startDelete(draft);
  }

  protected convertFromPreview(draft: OrderWithCustomer): void {
    this.closePreview();
    void this.startConversion(draft);
  }

  protected startDelete(draft: OrderWithCustomer): void {
    this.deleting.set(draft);
    this.deleteModal()?.show();
  }

  protected async confirmDelete(): Promise<void> {
    const draft = this.deleting();
    if (!draft) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.completedSale.set(null);
    try {
      await this.pos.deleteProforma(draft.id);
      this.deleteModal()?.hide();
      this.deleting.set(null);
      this.notice.set(`Proforma ${draft.code} deleted`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to delete proforma');
    } finally {
      this.busy.set(false);
    }
  }

  protected async convert(orderId: string, payments: PaymentInput[]): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.completedSale.set(null);
    try {
      await this.cashierSession.assertOpen('converting a proforma to a sale');
    } catch (err) {
      this.converting.set(null);
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busy.set(true);
    const draft = this.converting();
    try {
      const mpesaPayment = payments.find(
        payment =>
          payment.method === 'mpesa' &&
          (payment.phone || (this.mpesa.availability().manualFallback && payment.reference))
      );
      if (mpesaPayment) {
        if (!draft?.location_id) throw new Error('This proforma has no business location.');
        const cashPayments = payments
          .filter(payment => payment !== mpesaPayment)
          .map(({ phone: _phone, ...payment }) => payment);
        const outcome = await this.mpesaCheckout.run(
          retry =>
            this.mpesa.initiateOrder({
              orderId,
              locationId: draft.location_id,
              mpesaAmount: mpesaPayment.amount,
              cashAmount: cashPayments.reduce((sum, payment) => sum + payment.amount, 0),
              clientRef: this.convertClientRef!,
              retry,
              ...(mpesaPayment.phone
                ? { phone: mpesaPayment.phone }
                : { receipt: mpesaPayment.reference! }),
            }),
          this.convertMpesaRetryAllowed
        );
        if (outcome.kind === 'awaiting_cash') {
          this.converting.set(null);
          this.mpesaSplitReady.set({
            intentId: outcome.intentId,
            orderId,
            code: draft.code,
            cashPayments,
            cashAmount: outcome.cashAmount,
          });
          this.notice.set('M-PESA received. Confirm the cash side.');
          return;
        }
        if (outcome.kind === 'manual_review') {
          this.converting.set(null);
          this.convertClientRef = null;
          this.convertMpesaRetryAllowed = false;
          await this.load();
          throw new Error(outcome.message);
        }
        if (outcome.kind === 'failed' && outcome.retryAllowed) this.convertMpesaRetryAllowed = true;
        if (outcome.kind !== 'completed') throw new Error(outcome.message);
        this.converting.set(null);
        this.convertClientRef = null;
        this.convertMpesaRetryAllowed = false;
        this.completedSale.set({ id: orderId, code: draft.code });
        this.notice.set(`${draft.code} completed`);
        await this.load();
        return;
      }
      const completedOrderId = await this.pos.convertDraft(orderId, payments);
      this.converting.set(null);
      this.convertClientRef = null;
      this.convertMpesaRetryAllowed = false;
      this.completedSale.set({ id: completedOrderId, code: draft?.code ?? 'Sale' });
      this.notice.set(`${draft?.code ?? 'Sale'} completed`);
      await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      if (message.includes('proforma_expired')) {
        this.error.set('This proforma has expired and can no longer be converted.');
        this.converting.set(null);
        await this.load();
      } else {
        this.error.set(message);
      }
      // Below-wholesale drafts wait on an approval before they can complete.
      if (message.includes('below_wholesale_approval_required')) {
        this.converting.set(null);
        this.notice.set('This proforma is waiting for price approval.');
        const history = await this.approvals.forOrder(orderId).catch(() => []);
        const pending = history.find(
          item => item.type === 'below_wholesale' && item.status === 'pending'
        );
        if (pending) this.draftApprovals.update(rows => new Map(rows).set(orderId, pending));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmMpesaCash(): Promise<void> {
    const split = this.mpesaSplitReady();
    if (!split) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.mpesaCheckout.finalizeCash(split.intentId);
      this.mpesaSplitReady.set(null);
      this.convertClientRef = null;
      this.convertMpesaRetryAllowed = false;
      this.completedSale.set({ id: split.orderId, code: split.code });
      this.notice.set(`${split.code} completed`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not finish split payment');
    } finally {
      this.busy.set(false);
    }
  }

  protected async startConversion(draft: OrderWithCustomer): Promise<void> {
    this.error.set(null);
    this.completedSale.set(null);
    if (draft.status !== 'draft' || new Date(draft.expires_at).getTime() <= Date.now()) {
      this.error.set('This proforma has expired and can no longer be converted.');
      await this.load();
      return;
    }
    try {
      await this.cashierSession.assertOpen('converting a proforma to a sale');
      this.convertClientRef = crypto.randomUUID();
      this.convertMpesaRetryAllowed = false;
      this.converting.set(draft);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
    }
  }

  protected async printReceipt(orderId: string): Promise<void> {
    this.printing.set(true);
    this.error.set(null);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.printing.set(false);
    }
  }

  protected customerName(order: OrderWithCustomer): string {
    if (!order.customers) return 'Walk-in';
    return [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected validityLabel(order: OrderWithCustomer): string {
    const date = new Date(order.expires_at).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return order.status === 'expired' ? `Expired ${date}` : `Valid until ${date}`;
  }

  protected draftApproval(orderId: string): Approval | null {
    return this.draftApprovals().get(orderId) ?? null;
  }

  protected approvalTone(status: Approval['status']): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'denied' || status === 'expired') return 'error';
    return 'neutral';
  }

  protected approvalLabel(approval: Approval): string {
    if (approval.status === 'pending') return 'Price approval pending';
    if (approval.status === 'approved') return 'Price approved';
    if (approval.status === 'denied') return 'Price denied';
    return 'Price approval expired';
  }

  private async openRouteDraft(orderId: string | null, approvalId: string | null): Promise<void> {
    this.highlightedApprovalId.set(approvalId);
    if (!orderId) {
      if (this.selectedDraftId()) this.closePreview(false);
      return;
    }
    if (!this.proformas().some(draft => draft.id === orderId)) {
      try {
        const linked = await this.pos.getOrder(orderId);
        if (linked.status !== 'draft')
          throw new Error('The linked record is no longer a proforma.');
        this.proformas.update(rows => [linked, ...rows]);
      } catch (error) {
        this.error.set(
          error instanceof Error ? error.message : 'The linked proforma could not be found.'
        );
        return;
      }
    }
    if (this.selectedDraftId() !== orderId || approvalId) await this.openPreview(orderId, false);
  }
}
