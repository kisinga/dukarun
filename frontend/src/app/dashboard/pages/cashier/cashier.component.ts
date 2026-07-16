import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../core/services/currency.service';
import { OrderService } from '../../../core/services/order.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  CashierPendingOrderView,
  CashierSettlementService,
  OrderTenderInput,
} from '../../../core/services/cashier/cashier-settlement.service';
import { SettleOrderModalComponent } from './components/settle-order-modal.component';

/**
 * Cashier Queue
 *
 * The cashier's worklist: orders a salesperson sent over for payment. Each card shows
 * who created the order, when it was sent, customer details, line items, and the amount
 * due. The cashier can collect payment or void the order.
 * Gated by the SettleOrder permission (see cashierGuard).
 */
@Component({
  selector: 'app-cashier',
  imports: [CommonModule, NgIcon, SettleOrderModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-5">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ng-icon name="heroBanknotes" size="1.5rem" class="text-primary" />
            Cashier
          </h1>
          <p class="text-sm text-base-content/60 mt-0.5">Orders waiting for payment</p>
        </div>
        <button
          class="btn btn-sm btn-ghost gap-1"
          (click)="refresh()"
          [disabled]="isLoading()"
          aria-label="Refresh queue"
        >
          <ng-icon name="heroArrowPath" size="1.25rem" [class.animate-spin]="isLoading()" />
          <span class="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <!-- Error -->
      @if (error(); as err) {
        <div class="alert alert-error">
          <ng-icon name="heroXCircle" size="1.25rem" />
          <span class="flex-1 text-sm">{{ err }}</span>
          <button class="btn btn-sm" (click)="refresh()">Retry</button>
        </div>
      }

      <!-- Loading -->
      @if (isLoading() && orders().length === 0) {
        <div class="flex items-center justify-center py-16">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (orders().length === 0) {
        <!-- Empty -->
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <ng-icon name="heroCheckCircle" size="3rem" class="text-success/60" />
          <p class="mt-3 font-semibold">No orders waiting</p>
          <p class="text-sm text-base-content/60">
            Orders sent to the cashier from the sell screen appear here.
          </p>
        </div>
      } @else {
        <!-- Queue -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          @for (item of orders(); track item.order.id) {
            <div class="card bg-base-100 border border-base-300">
              <div class="card-body p-4">
                <!-- Code + due -->
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="font-semibold truncate">{{ item.order.code }}</div>
                    <div class="text-xs text-base-content/50 mt-0.5">
                      Sent
                      {{
                        formatDateTime(
                          item.pendingSince ?? item.order.orderPlacedAt ?? item.order.createdAt
                        )
                      }}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-xs text-base-content/60">Due</div>
                    <div class="text-lg font-bold text-primary">
                      {{ formatCurrency(item.amountOwing) }}
                    </div>
                  </div>
                </div>

                <!-- Customer -->
                <div class="mt-2 text-sm">
                  <span class="text-base-content/60">Customer:</span>
                  <span class="font-medium ml-1">{{ customerName(item) }}</span>
                  @if (customerContact(item); as contact) {
                    <span class="text-xs text-base-content/50 block truncate">{{ contact }}</span>
                  }
                </div>

                <!-- Created by -->
                @if (item.createdBy) {
                  <div class="mt-1 text-sm">
                    <span class="text-base-content/60">Sent by:</span>
                    <span class="font-medium ml-1">{{ item.createdBy.identifier }}</span>
                  </div>
                }

                <!-- Items -->
                <div class="mt-2 text-sm">
                  <span class="text-base-content/60"
                    >{{ itemCount(item) }} item{{ itemCount(item) === 1 ? '' : 's' }}</span
                  >
                  <span class="text-xs text-base-content/50 truncate block">
                    {{ itemSummary(item) }}
                  </span>
                </div>

                <!-- Actions -->
                <div class="card-actions mt-3 flex gap-2">
                  <button
                    type="button"
                    class="btn btn-outline btn-error btn-sm flex-1 gap-1"
                    (click)="voidOrder(item)"
                    [disabled]="voidingOrderId() === item.order.id"
                  >
                    @if (voidingOrderId() === item.order.id) {
                      <span class="loading loading-spinner loading-xs"></span>
                      Voiding...
                    } @else {
                      <ng-icon name="heroXMark" size="1.125rem" />
                      Void
                    }
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm flex-[2] gap-1"
                    (click)="collect(item)"
                  >
                    <ng-icon name="heroBanknotes" size="1.125rem" />
                    Collect payment
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <app-settle-order-modal
      #settleModal
      (confirm)="onConfirm($event)"
      (settled)="onSettled()"
      (cancelled)="onCancelled()"
    />
  `,
})
export class CashierComponent implements OnInit {
  private readonly settlementService = inject(CashierSettlementService);
  private readonly orderService = inject(OrderService);
  private readonly currencyService = inject(CurrencyService);
  private readonly toastService = inject(ToastService);

  private readonly settleModal = viewChild<SettleOrderModalComponent>('settleModal');

  readonly orders = signal<CashierPendingOrderView[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly voidingOrderId = signal<string | null>(null);
  private readonly selectedItem = signal<CashierPendingOrderView | null>(null);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      this.orders.set(await this.settlementService.getPendingOrders());
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to load the cashier queue.');
    } finally {
      this.isLoading.set(false);
    }
  }

  collect(item: CashierPendingOrderView): void {
    this.selectedItem.set(item);
    void this.settleModal()?.show({
      total: item.amountOwing,
      orderCode: item.order.code,
      customerName: this.customerName(item),
    });
  }

  async voidOrder(item: CashierPendingOrderView): Promise<void> {
    if (
      !confirm(
        `Void order ${item.order.code}?\n\nThis cancels the sale and returns the items to stock.`,
      )
    ) {
      return;
    }

    this.voidingOrderId.set(item.order.id);
    try {
      await this.orderService.voidOrder(item.order.id);
      this.toastService.show('Order voided', `${item.order.code} has been voided.`, 'success');
      await this.refresh();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Failed to void order';
      this.toastService.show('Void failed', message, 'error');
    } finally {
      this.voidingOrderId.set(null);
    }
  }

  async onConfirm(tenders: OrderTenderInput[]): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;
    try {
      await this.settlementService.settleOrder(item.order.id, tenders);
      this.settleModal()?.succeed();
    } catch (err: any) {
      this.settleModal()?.fail(err?.message || 'Failed to collect payment. Please try again.');
    }
  }

  onSettled(): void {
    this.selectedItem.set(null);
    void this.refresh();
  }

  onCancelled(): void {
    this.selectedItem.set(null);
  }

  customerName(item: CashierPendingOrderView): string {
    const c = item.order.customer;
    const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim();
    return name || 'Walk-in customer';
  }

  customerContact(item: CashierPendingOrderView): string | null {
    const c = item.order.customer;
    if (!c) return null;
    const parts = [c.phoneNumber, c.emailAddress].filter(Boolean);
    return parts.join(' · ') || null;
  }

  itemCount(item: CashierPendingOrderView): number {
    return item.order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  itemSummary(item: CashierPendingOrderView): string {
    const names = item.order.lines.map((line) => `${line.quantity}× ${line.productVariant.name}`);
    return names.join(', ');
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents, false);
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return 'unknown time';
    return new Date(dateString).toLocaleString();
  }
}
