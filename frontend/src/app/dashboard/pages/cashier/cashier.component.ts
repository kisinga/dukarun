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
import {
  CashierPendingOrderView,
  CashierSettlementService,
  OrderTenderInput,
} from '../../../core/services/cashier/cashier-settlement.service';
import { SettleOrderModalComponent } from './components/settle-order-modal.component';

/**
 * Cashier Queue
 *
 * The cashier's worklist: orders a salesperson sent over for payment. Each row shows
 * what is owed; "Collect payment" opens the split-tender settlement modal. Gated by the
 * SettleOrder permission (see cashierGuard).
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          @for (item of orders(); track item.order.id) {
            <div class="card bg-base-100 border border-base-300">
              <div class="card-body p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-semibold truncate">{{ item.order.code }}</div>
                    <div class="text-xs text-base-content/60 truncate">
                      {{ customerName(item) }}
                    </div>
                    <div class="text-xs text-base-content/50 mt-0.5">
                      {{ itemCount(item) }} item{{ itemCount(item) === 1 ? '' : 's' }}
                      @if (item.pendingSince) {
                        · {{ item.pendingSince | date: 'shortTime' }}
                      }
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-xs text-base-content/60">Due</div>
                    <div class="text-lg font-bold text-primary">
                      {{ formatCurrency(item.amountOwing) }}
                    </div>
                  </div>
                </div>

                <div class="card-actions mt-2">
                  <button class="btn btn-primary btn-sm w-full gap-1" (click)="collect(item)">
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
  private readonly currencyService = inject(CurrencyService);

  private readonly settleModal = viewChild<SettleOrderModalComponent>('settleModal');

  readonly orders = signal<CashierPendingOrderView[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
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

  itemCount(item: CashierPendingOrderView): number {
    return item.order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents, false);
  }
}
