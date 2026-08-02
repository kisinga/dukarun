import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes } from '../../core/money';
import { OrderLineWithProduct, OrderWithCustomer, Payment, PosService } from '../pos.service';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';

@Component({
  selector: 'app-today-sales',
  imports: [RouterLink, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Today's Sales" backLink="/dashboard" backLabel="Dashboard">
          <button actions class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </app-page-header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (warning()) {
          <p class="mb-2 text-sm text-warning">{{ warning() }}</p>
        }

        @if (orders().length === 0) {
          <app-empty-state icon="heroBanknotes" title="No sales yet today." />
        } @else {
          <div class="flex flex-col gap-2">
            @for (order of orders(); track order.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <button class="font-mono font-semibold link" (click)="toggle(order.id)">
                      {{ order.code }}
                    </button>
                    <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                    <span class="text-sm">{{ customerName(order) }}</span>
                    @if (order.is_credit_sale) {
                      <span class="badge badge-warning">credit</span>
                    }
                    @if (order.status === 'voided') {
                      <span class="badge badge-error">voided</span>
                    }
                    <span class="ml-auto font-bold tabular-nums">{{ fmt(order.total) }}</span>
                    @if (order.status !== 'voided') {
                      <button
                        class="btn btn-error btn-outline btn-sm"
                        (click)="startVoid(order.id)"
                      >
                        Void
                      </button>
                    }
                  </div>

                  @if (order.status === 'voided' && order.void_reason) {
                    <p class="mt-1 text-xs text-base-content/60">
                      Void reason: {{ order.void_reason }}
                    </p>
                  }

                  @if (voidingFor() === order.id) {
                    <div class="mt-2 flex flex-wrap items-end gap-2 rounded bg-base-200 p-2">
                      <label class="form-control flex-1">
                        <span class="label-text">Reason</span>
                        <input
                          type="text"
                          class="input input-bordered input-sm"
                          placeholder="e.g. Wrong item rung up"
                          [formControl]="voidReason"
                        />
                      </label>
                      <button
                        class="btn btn-error btn-sm"
                        [disabled]="voidReason.value.trim().length === 0 || busy()"
                        (click)="confirmVoid(order.id)"
                      >
                        Confirm void
                      </button>
                      <button class="btn btn-ghost btn-sm" (click)="voidingFor.set(null)">
                        Cancel
                      </button>
                    </div>
                  }

                  @if (expandedFor() === order.id) {
                    <div class="mt-3 border-t pt-3">
                      <table class="table table-sm">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th class="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (line of lines(); track line.id) {
                            <tr>
                              <td>{{ line.label }}</td>
                              <td>{{ line.quantity }}</td>
                              <td>{{ fmt(line.custom_price ?? line.unit_price) }}</td>
                              <td class="text-right">{{ fmt(line.line_total) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      @if (payments().length > 0) {
                        <div class="mt-2 flex flex-wrap gap-2">
                          @for (p of payments(); track p.id) {
                            <span class="badge badge-outline">
                              {{ p.method_code }} · {{ fmt(p.amount) }}
                              @if (p.reference) {
                                · {{ p.reference }}
                              }
                            </span>
                          }
                        </div>
                      } @else {
                        <p class="mt-2 text-xs text-base-content/60">Credit sale — no payments.</p>
                      }
                      @if (printerEnabled()) {
                        <button class="btn btn-outline btn-xs mt-2" (click)="printOrder(order.id)">
                          Print receipt
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </main>
  `,
})
export class TodaySalesComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly fmt = formatKes;
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly voidingFor = signal<string | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly warning = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);

  private channel: RealtimeChannel | null = null;

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    await this.load();
    // Realtime: today's list refreshes on any order/payment change.
    this.channel = this.pos.client
      .channel('pos-today-sales')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => void this.load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => void this.load()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.channel) void this.pos.client.removeChannel(this.channel);
  }

  protected async load(): Promise<void> {
    try {
      this.orders.set(await this.pos.ordersByStatus(['completed', 'voided'], this.startOfToday()));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sales');
    }
  }

  protected async toggle(orderId: string): Promise<void> {
    if (this.expandedFor() === orderId) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(orderId);
    try {
      const [lines, payments] = await Promise.all([
        this.pos.orderLines(orderId),
        this.pos.orderPayments(orderId),
      ]);
      this.lines.set(lines);
      this.payments.set(payments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load order details');
    }
  }

  protected async printOrder(orderId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildOrderData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected startVoid(orderId: string): void {
    this.voidingFor.set(orderId);
    this.voidReason.setValue('');
  }

  protected async confirmVoid(orderId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.warning.set(null);
    try {
      const result = await this.pos.voidSale(orderId, this.voidReason.value.trim());
      this.voidingFor.set(null);
      if (result.status === 'approval_required') {
        // Not voided — the request waits in the Approvals inbox. Not an error.
        this.warning.set('Void request sent for approval');
      } else {
        this.expandedFor.set(null);
      }
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Void failed');
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

  private startOfToday(): string {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
}
