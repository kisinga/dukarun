import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { OrderLineWithProduct, OrderWithCustomer, Payment, PosService } from '../pos/pos.service';

const ALL_STATUSES = ['completed', 'voided', 'draft', 'pending_payment'];

@Component({
  selector: 'app-orders',
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Orders</h1>
          <button class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </header>

        <!-- Filters -->
        <div class="card mb-4 bg-base-100 shadow">
          <div class="card-body flex-row flex-wrap items-end gap-3 p-4">
            <label class="form-control">
              <span class="label-text text-xs">Status</span>
              <select class="select select-bordered select-sm" [formControl]="status">
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
                <option value="draft">Draft (proforma)</option>
                <option value="pending_payment">Pending payment</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs">From</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="from" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">To</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="to" />
            </label>
            <button class="btn btn-primary btn-sm" (click)="load()">Apply</button>
          </div>
        </div>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }

        @if (orders().length === 0) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <p class="text-center text-base-content/60">No orders in this range.</p>
            </div>
          </div>
        } @else {
          <div class="flex flex-col gap-2">
            @for (order of orders(); track order.id) {
              <div class="card bg-base-100 shadow">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <button class="link font-mono font-semibold" (click)="toggle(order.id)">
                      {{ order.code }}
                    </button>
                    <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                    <span class="text-sm">{{ customerName(order) }}</span>
                    <span
                      class="badge"
                      [class.badge-success]="order.status === 'completed'"
                      [class.badge-error]="order.status === 'voided'"
                      [class.badge-warning]="order.status === 'pending_payment'"
                      [class.badge-outline]="order.status === 'draft'"
                    >
                      {{ order.status }}
                    </span>
                    @if (order.is_credit_sale) {
                      <span class="badge badge-warning">credit</span>
                    }
                    <span class="ml-auto font-bold">{{ fmt(order.total) }}</span>
                  </div>

                  @if (order.status === 'voided' && order.void_reason) {
                    <p class="mt-1 text-xs text-base-content/60">
                      Void reason: {{ order.void_reason }}
                    </p>
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
                              <td>{{ line.products?.name ?? line.product_id }}</td>
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
                        <p class="mt-2 text-xs text-base-content/60">
                          No payments (credit sale or proforma).
                        </p>
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
export class OrdersComponent implements OnInit {
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly error = signal<string | null>(null);

  protected readonly status = new FormControl('all', { nonNullable: true });
  protected readonly from = new FormControl(this.daysAgo(7), { nonNullable: true });
  protected readonly to = new FormControl(this.daysAgo(0), { nonNullable: true });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const statuses = this.status.value === 'all' ? ALL_STATUSES : [this.status.value];
      const since = new Date(`${this.from.value}T00:00:00`).toISOString();
      // "To" is inclusive: bound by the start of the next day.
      const untilDate = new Date(`${this.to.value}T00:00:00`);
      untilDate.setDate(untilDate.getDate() + 1);
      this.orders.set(await this.pos.ordersByStatus(statuses, since, untilDate.toISOString()));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load orders');
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

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
