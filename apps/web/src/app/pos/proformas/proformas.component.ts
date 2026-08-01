import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatKes } from '../../core/money';
import { CheckoutPanelComponent } from '../checkout/checkout-panel.component';
import { OrderWithCustomer, PaymentInput, PosService } from '../pos.service';

@Component({
  selector: 'app-proformas',
  imports: [RouterLink, CheckoutPanelComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <header class="mb-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Dashboard</a>
          <h1 class="text-2xl font-bold">Proformas</h1>
          <button class="btn btn-ghost btn-sm ml-auto" (click)="load()">Refresh</button>
        </header>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        @if (drafts().length === 0) {
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <p class="text-center text-base-content/60">No proformas.</p>
            </div>
          </div>
        } @else {
          <div class="flex flex-col gap-2">
            @for (draft of drafts(); track draft.id) {
              <div class="card bg-base-100 shadow">
                <div class="card-body flex-row flex-wrap items-center gap-3 p-4">
                  <span class="font-mono font-semibold">{{ draft.code }}</span>
                  <span class="text-sm text-base-content/60">{{ time(draft.created_at) }}</span>
                  <span class="text-sm">{{ customerName(draft) }}</span>
                  <span class="ml-auto font-bold">{{ fmt(draft.total) }}</span>
                  <button class="btn btn-outline btn-sm" (click)="edit(draft.id)">Edit</button>
                  <button class="btn btn-primary btn-sm" (click)="converting.set(draft)">
                    Convert to Sale
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (converting(); as draft) {
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
    </main>
  `,
})
export class ProformasComponent implements OnInit {
  private readonly pos = inject(PosService);
  private readonly router = inject(Router);

  protected readonly fmt = formatKes;
  protected readonly drafts = signal<OrderWithCustomer[]>([]);
  protected readonly converting = signal<OrderWithCustomer | null>(null);
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
      this.drafts.set(await this.pos.ordersByStatus(['draft']));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load proformas');
    }
  }

  protected edit(orderId: string): void {
    void this.router.navigate(['/pos/sell'], { queryParams: { draft: orderId } });
  }

  protected async convert(orderId: string, payments: PaymentInput[]): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.pos.convertDraft(orderId, payments);
      this.converting.set(null);
      this.notice.set('Proforma converted to a sale');
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Conversion failed');
      this.converting.set(null);
    } finally {
      this.busy.set(false);
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
