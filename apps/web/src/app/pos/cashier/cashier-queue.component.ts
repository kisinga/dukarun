import { Component, OnInit, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { formatKes } from '../../core/money';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { OrderWithCustomer, PaymentInput, PosService } from '../pos.service';

@Component({
  selector: 'app-cashier-queue',
  imports: [CheckoutPanelComponent, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Cashier Queue" backLink="/dashboard" backLabel="Dashboard">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        @if (parked().length === 0) {
          <app-empty-state icon="heroBanknotes" title="No parked orders waiting for payment." />
        } @else {
          <div class="flex flex-col gap-2">
            @for (order of parked(); track order.id) {
              <div class="card bg-base-100">
                <div class="card-body flex-row flex-wrap items-center gap-3 p-4">
                  <span class="font-mono font-semibold">{{ order.code }}</span>
                  <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                  <span class="text-sm">{{ customerName(order) }}</span>
                  <span class="ml-auto font-bold tabular-nums">{{ fmt(order.total) }}</span>
                  <button class="btn btn-primary btn-sm" (click)="settling.set(order)">
                    Settle
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (settling(); as order) {
        <app-checkout-panel
          [total]="order.total"
          [creditAllowed]="order.customer_id !== null"
          [methods]="methods()"
          [busy]="busy()"
          [title]="'Settle ' + order.code"
          (confirmed)="settle(order.id, $event)"
          (cancelled)="settling.set(null)"
        />
      }
    </main>
  `,
})
export class CashierQueueComponent implements OnInit {
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly parked = signal<OrderWithCustomer[]>([]);
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
      this.parked.set(await this.pos.ordersByStatus(['pending_payment']));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load queue');
    }
  }

  protected async settle(orderId: string, payments: PaymentInput[]): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.settleOrder(orderId, payments);
      this.settling.set(null);
      this.notice.set('Order settled');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Settle failed');
      this.settling.set(null);
    } finally {
      this.busy.set(false);
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
