import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { formatKes } from '../../core/money';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { OrderWithCustomer, PaymentInput, PosService } from '../pos.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DeleteConfirmationModalComponent } from '../../shared/ui/delete-confirmation-modal.component';

@Component({
  selector: 'app-proformas',
  imports: [
    RouterLink,
    CheckoutPanelComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    SessionRequiredNoticeComponent,
    ButtonComponent,
    DeleteConfirmationModalComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Proformas">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (approvalPending()) {
          <p class="mb-2 text-sm text-warning">
            This sale is waiting for a below-wholesale approval in the
            <a routerLink="/approvals" class="link font-medium">Approvals inbox</a>.
          </p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }
        @if (!cashierSession.isOpen() && drafts().length > 0) {
          <app-session-required-notice action="converting a proforma to a sale" />
        }

        @if (drafts().length === 0) {
          <app-empty-state
            icon="heroClipboardDocumentList"
            title="No proformas"
            description="Save a sale as proforma from the Sell screen and it waits here to convert."
          />
        } @else {
          <div class="flex flex-col gap-2">
            @for (draft of drafts(); track draft.id) {
              <div class="card bg-base-100">
                <div class="card-body flex-row flex-wrap items-center gap-3 p-4">
                  <span class="font-mono font-semibold">{{ draft.code }}</span>
                  <span class="text-sm text-base-content/60">{{ time(draft.created_at) }}</span>
                  <span class="text-sm">{{ customerName(draft) }}</span>
                  <span class="ml-auto font-bold tabular-nums">{{ fmt(draft.total) }}</span>
                  <button class="btn btn-outline btn-sm" (click)="edit(draft.id)">Edit</button>
                  @if (printerEnabled()) {
                    <button class="btn btn-ghost btn-sm" (click)="printProforma(draft.id)">
                      Print
                    </button>
                  }
                  <button
                    appButton
                    variant="error"
                    size="sm"
                    [disabled]="busy()"
                    (click)="startDelete(draft)"
                  >
                    Delete
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    [disabled]="!cashierSession.isOpen()"
                    (click)="startConversion(draft)"
                  >
                    Convert to Sale
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (cashierSession.isOpen() && converting(); as draft) {
        <app-checkout-panel
          [total]="draft.total"
          [creditAllowed]="draft.customer_id !== null"
          [methods]="methods()"
          [busy]="busy()"
          [title]="'Convert ' + draft.code"
          (confirmed)="convert(draft.id, $event)"
          (cancelled)="converting.set(null)"
        />
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
    </main>
  `,
})
export class ProformasComponent implements OnInit {
  private readonly pos = inject(PosService);
  private readonly router = inject(Router);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly fmt = formatKes;
  protected readonly drafts = signal<OrderWithCustomer[]>([]);
  protected readonly converting = signal<OrderWithCustomer | null>(null);
  protected readonly deleting = signal<OrderWithCustomer | null>(null);
  protected readonly methods = signal<string[]>(['cash', 'mpesa', 'bank']);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly approvalPending = signal(false);
  protected readonly printerEnabled = signal(false);
  protected readonly deleteData = computed(() => ({
    entityName: this.deleting()?.code ?? 'proforma',
    warningDetails: ['The proforma and its line items will be permanently removed.'],
  }));
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    try {
      this.methods.set(await this.pos.enabledPaymentMethods());
    } catch {
      // keep defaults
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.drafts.set(await this.pos.ordersByStatus(['draft']));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load proformas');
    }
  }

  protected async printProforma(orderId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildOrderData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, {
        ...meta,
        documentType: 'proforma',
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
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
    try {
      await this.cashierSession.assertOpen('converting a proforma to a sale');
    } catch (err) {
      this.converting.set(null);
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busy.set(true);
    try {
      await this.pos.convertDraft(orderId, payments);
      this.converting.set(null);
      this.notice.set('Proforma converted to a sale');
      await this.load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      this.error.set(message);
      // Below-wholesale drafts wait on an approval before they can complete.
      this.approvalPending.set(message.includes('below_wholesale_approval_required'));
      this.converting.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected async startConversion(draft: OrderWithCustomer): Promise<void> {
    this.error.set(null);
    try {
      await this.cashierSession.assertOpen('converting a proforma to a sale');
      this.converting.set(draft);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
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
}
