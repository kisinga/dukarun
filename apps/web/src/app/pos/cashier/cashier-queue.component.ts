import { Component, OnInit, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { OrderLineWithProduct, OrderWithCustomer, PaymentInput, PosService } from '../pos.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { MoneyComponent } from '../../shared/ui/money.component';

@Component({
  selector: 'app-cashier-queue',
  imports: [
    CheckoutPanelComponent,
    PageHeaderComponent,
    EmptyStateComponent,
    SessionRequiredNoticeComponent,
    ButtonComponent,
    MoneyComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Cashier Queue">
          <button actions appButton variant="ghost" size="sm" class="ml-auto" (click)="load()">
            Refresh
          </button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }
        @if (!cashierSession.isOpen()) {
          <app-session-required-notice action="collecting payment from the cashier queue" />
        }

        @if (parked().length === 0) {
          <app-empty-state
            icon="heroBanknotes"
            title="No sales waiting"
            description="Sales sent from the Sell screen appear here until payment is collected."
          />
        } @else {
          <div class="flex flex-col gap-2">
            @for (order of parked(); track order.id) {
              <div class="card bg-base-100">
                <div class="card-body p-0">
                  <div class="flex flex-wrap items-center gap-3 p-4">
                    <div class="min-w-0">
                      <p class="font-mono font-semibold">{{ order.code }}</p>
                      <p class="type-caption mt-1">
                        {{ time(order.created_at) }} · {{ customerName(order) }}
                      </p>
                    </div>
                    <span class="ml-auto font-bold">
                      <app-money [cents]="order.total" [showCurrency]="true" />
                    </span>
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      [loading]="loadingLinesFor() === order.id"
                      [attr.aria-expanded]="expandedFor() === order.id"
                      (click)="toggleItems(order.id)"
                    >
                      {{ expandedFor() === order.id ? 'Hide items' : 'View items' }}
                    </button>
                    <button
                      appButton
                      size="sm"
                      type="button"
                      [disabled]="!cashierSession.isOpen()"
                      (click)="startSettlement(order)"
                    >
                      Collect payment
                    </button>
                  </div>

                  @if (expandedFor() === order.id) {
                    <div class="border-t border-base-300/60 px-4 pb-2">
                      @if (loadingLinesFor() === order.id) {
                        <div
                          class="flex items-center justify-center gap-2 py-6 text-base-content/60"
                        >
                          <span class="loading loading-spinner loading-sm"></span>
                          <span>Loading items…</span>
                        </div>
                      } @else if (lines().length === 0) {
                        <p class="py-4 text-sm text-base-content/60">
                          No items found for this sale.
                        </p>
                      } @else {
                        <ul class="divide-y divide-base-300/60" aria-label="Sale items">
                          @for (line of lines(); track line.id) {
                            <li class="flex items-center gap-4 py-3">
                              <div class="min-w-0 flex-1">
                                <p class="truncate font-medium">{{ line.label }}</p>
                                <p class="type-caption mt-1">
                                  {{ line.quantity }} ×
                                  <app-money [cents]="line.custom_price ?? line.unit_price" />
                                </p>
                              </div>
                              <span class="font-semibold">
                                <app-money [cents]="line.line_total" />
                              </span>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (cashierSession.isOpen() && settling(); as order) {
        <app-checkout-panel
          [total]="order.total"
          [creditAllowed]="order.customer_id !== null"
          [methods]="methods()"
          [busy]="busy()"
          [heading]="'Collect payment · ' + order.code"
          (confirmed)="settle(order.id, $event)"
          (cancelled)="settling.set(null)"
        />
      }
    </main>
  `,
})
export class CashierQueueComponent implements OnInit {
  private readonly pos = inject(PosService);
  protected readonly cashierSession = inject(CashierSessionService);

  protected readonly parked = signal<OrderWithCustomer[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly loadingLinesFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly settling = signal<OrderWithCustomer | null>(null);
  protected readonly methods = signal<string[]>(['cash', 'mpesa', 'bank']);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.methods.set(await this.pos.enabledPaymentMethods());
    } catch {
      // keep defaults
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const orders = await this.pos.ordersByStatus(['pending_payment']);
      this.parked.set(orders);
      if (this.expandedFor() && !orders.some(order => order.id === this.expandedFor())) {
        this.expandedFor.set(null);
        this.lines.set([]);
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load queue');
    }
  }

  protected async toggleItems(orderId: string): Promise<void> {
    if (this.expandedFor() === orderId) {
      this.expandedFor.set(null);
      this.lines.set([]);
      return;
    }

    this.expandedFor.set(orderId);
    this.loadingLinesFor.set(orderId);
    this.lines.set([]);
    this.error.set(null);
    try {
      const lines = await this.pos.orderLines(orderId);
      if (this.expandedFor() === orderId) this.lines.set(lines);
    } catch (err) {
      if (this.expandedFor() === orderId) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load sale items');
      }
    } finally {
      if (this.loadingLinesFor() === orderId) this.loadingLinesFor.set(null);
    }
  }

  protected async settle(orderId: string, payments: PaymentInput[]): Promise<void> {
    try {
      await this.cashierSession.assertOpen('collecting payment');
    } catch (err) {
      this.settling.set(null);
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.settleOrder(orderId, payments);
      this.settling.set(null);
      this.notice.set('Payment collected');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Payment collection failed');
      this.settling.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected async startSettlement(order: OrderWithCustomer): Promise<void> {
    this.error.set(null);
    try {
      await this.cashierSession.assertOpen('collecting payment');
      this.settling.set(order);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
    }
  }

  protected customerName(order: OrderWithCustomer): string {
    if (!order.customers) return 'Walk-in';
    return [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  }
}
