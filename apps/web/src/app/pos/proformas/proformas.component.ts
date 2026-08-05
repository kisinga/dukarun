import { Component, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { formatKes } from '../../core/money';
import {
  CheckoutPanelComponent,
  type PaymentMethodOption,
} from '../checkout/checkout-panel.component';
import { OrderWithCustomer, PaymentInput, PosService } from '../pos.service';
import { PermissionsService } from '../../core/permissions.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../../shared/ui/delete-confirmation-modal.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OrderQueueCountsService } from '../order-queue-counts.service';
import { ListSearchBarComponent } from '../../shared/ui/list-search-bar.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { MoneyComponent } from '../../shared/ui/money.component';

const PROFORMA_STATUSES = ['draft', 'expired'];

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
    MoneyComponent,
  ],
  template: `
    <app-page
      title="Proformas"
      subtitle="Review saved sales, make changes, and convert them when the customer is ready."
      [badge]="orderQueueCounts.proformas()"
      [wide]="true"
    >
      <button
        actions
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
      <a actions appButton routerLink="/pos/sell"> <app-icon name="heroPlus" /> New proforma </a>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (approvalPending()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>
            This sale is waiting for a below-wholesale approval in the
            <a routerLink="/approvals" class="link font-medium">Approvals inbox</a>.
          </span>
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
        <div class="flex flex-col gap-2 lg:hidden">
          @for (draft of proformas(); track draft.id) {
            <div class="card bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono font-semibold">{{ draft.code }}</span>
                      <app-status-badge
                        size="xs"
                        [type]="draft.status === 'expired' ? 'error' : 'info'"
                        [label]="draft.status === 'expired' ? 'Expired' : 'Active'"
                      />
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
                  <span class="shrink-0 font-bold tabular-nums">
                    <app-money [amount]="draft.total" />
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-2 border-t border-base-300/60 pt-3">
                  @if (draft.status === 'draft') {
                    <button appButton variant="outline" size="sm" (click)="edit(draft.id)">
                      <app-icon name="heroPencilSquare" /> Edit
                    </button>
                    @if (printerEnabled()) {
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        [disabled]="printing()"
                        (click)="printProforma(draft.id)"
                      >
                        <app-icon name="heroPrinter" /> Print
                      </button>
                    }
                  }
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    class="text-error"
                    [disabled]="busy()"
                    (click)="startDelete(draft)"
                  >
                    <app-icon name="heroXMark" /> Delete
                  </button>
                  @if (draft.status === 'draft') {
                    <button
                      appButton
                      size="sm"
                      class="ml-auto"
                      [disabled]="!cashierSession.canTakePayment() || busy()"
                      (click)="startConversion(draft)"
                    >
                      Convert to sale <app-icon name="heroArrowRight" />
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <div class="hidden lg:block">
          <app-data-table-shell
            title="Saved proformas"
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
                  <tr>
                    <td>{{ time(draft.created_at) }}</td>
                    <td class="font-mono font-semibold">{{ draft.code }}</td>
                    <td>{{ customerName(draft) }}</td>
                    <td>
                      <app-status-badge
                        size="xs"
                        [type]="draft.status === 'expired' ? 'error' : 'info'"
                        [label]="draft.status === 'expired' ? 'Expired' : 'Active'"
                      />
                    </td>
                    <td [class.text-error]="draft.status === 'expired'">
                      {{ validityLabel(draft) }}
                    </td>
                    <td class="table-number"><app-money [amount]="draft.total" /></td>
                    <td class="table-actions">
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
                          [disabled]="!cashierSession.canTakePayment() || busy()"
                          (click)="startConversion(draft)"
                        >
                          Convert to sale <app-icon name="heroArrowRight" />
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
      @if (cashierSession.canTakePayment() && converting(); as draft) {
        <app-checkout-panel
          [total]="draft.total"
          [methods]="panelMethods()"
          [canUseDirectAccounts]="canUseDirectAccounts()"
          [busy]="busy()"
          [heading]="'Convert ' + draft.code"
          (confirmed)="convert(draft.id, $event)"
          (approvalRequested)="directAccountRequested()"
          (cancelled)="converting.set(null)"
        />
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
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  private readonly perms = inject(PermissionsService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly orderQueueCounts = inject(OrderQueueCountsService);

  protected readonly proformas = signal<OrderWithCustomer[]>([]);
  protected readonly loading = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly query = signal('');
  protected readonly status = new FormControl('all', { nonNullable: true });
  protected readonly from = new FormControl('', { nonNullable: true });
  protected readonly to = new FormControl('', { nonNullable: true });
  protected readonly converting = signal<OrderWithCustomer | null>(null);
  protected readonly deleting = signal<OrderWithCustomer | null>(null);
  protected readonly methods = signal<PaymentMethodOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly completedSale = signal<{ id: string; code: string } | null>(null);
  protected readonly approvalPending = signal(false);
  protected readonly printerEnabled = signal(false);
  protected readonly directAccountNotice = signal(false);
  private directAccountTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
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
  protected readonly proformaStats = computed(() => {
    const rows = this.proformas();
    return [
      { label: 'Matching proformas', value: this.totalItems() },
      { label: 'Active on page', value: this.activeOnPage(), tone: 'info' as const },
      {
        label: 'Expired on page',
        value: rows.filter(proforma => proforma.status === 'expired').length,
        tone: 'error' as const,
      },
      {
        label: 'Value on page',
        value: formatKes(rows.reduce((total, proforma) => total + proforma.total, 0)),
      },
    ];
  });
  protected readonly deleteData = computed(() => ({
    entityName: this.deleting()?.code ?? 'proforma',
    warningDetails: ['The proforma and its line items will be permanently removed.'],
  }));
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    try {
      const methods = await this.pos.enabledPaymentMethods();
      this.methods.set(
        methods.map(m => ({
          code: m.code,
          name: m.name,
          isCashierControlled: m.is_cashier_controlled,
        }))
      );
    } catch {
      // No methods configured yet; the panel will show an empty method list.
    }
    await this.load();
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
      });
      this.proformas.set(result.rows);
      this.totalItems.set(result.count);
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

  protected async printProforma(orderId: string): Promise<void> {
    this.printing.set(true);
    this.error.set(null);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildProformaData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.printing.set(false);
    }
  }

  protected edit(orderId: string): void {
    void this.router.navigate(['/pos/sell'], { queryParams: { draft: orderId } });
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
      const completedOrderId = await this.pos.convertDraft(orderId, payments);
      this.converting.set(null);
      this.completedSale.set({ id: completedOrderId, code: draft?.code ?? 'Sale' });
      this.notice.set(`${draft?.code ?? 'Sale'} completed`);
      await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      if (message.includes('proforma_expired')) {
        this.error.set('This proforma has expired and can no longer be converted.');
        await this.load();
      } else {
        this.error.set(message);
      }
      // Below-wholesale drafts wait on an approval before they can complete.
      this.approvalPending.set(message.includes('below_wholesale_approval_required'));
      this.converting.set(null);
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
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
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
}
