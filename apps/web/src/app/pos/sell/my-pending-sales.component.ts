import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { OrderWithCustomer, PosService } from '../pos.service';
import { queueAge, waitLabel, type QueueAge } from '../queue-aging';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';

/**
 * Personal follow-up affordance for the salesperson: a subtle header chip on
 * the Sell screen showing how many of their own sales are still waiting at the
 * cashier, opening a drawer with the list. Hidden when there is nothing to
 * chase. Refreshes on init, on any orders-table realtime change, and manually.
 */
@Component({
  selector: 'app-my-pending-sales',
  imports: [ButtonComponent, DrawerComponent, EmptyStateComponent, IconComponent, MoneyComponent],
  template: `
    @if (orders().length > 0) {
      <button type="button" class="badge badge-ghost gap-1" (click)="open.set(true)">
        <app-icon name="heroQueueList" size="sm" />
        {{ orders().length }} awaiting payment
      </button>
    }

    <app-drawer
      [(open)]="open"
      title="Your sales at the till"
      subtitle="Sent to the cashier — follow up at the till if a customer is waiting."
    >
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh"
        aria-label="Refresh your sales at the till"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>

      @if (!loading() && orders().length === 0) {
        <app-empty-state
          [compact]="true"
          icon="heroBanknotes"
          title="Nothing waiting"
          description="Sales you send to the cashier appear here until payment is collected."
        />
      } @else {
        <ul class="flex flex-col gap-2" aria-label="Your sales at the till">
          @for (order of orders(); track order.id) {
            <li class="card bg-base-100" [class.bg-error/5]="ageOf(order) === 'stale'">
              <div class="card-body gap-1 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-mono font-semibold">{{ order.code }}</p>
                    <p class="type-caption mt-1">{{ customerName(order) }}</p>
                  </div>
                  <span class="shrink-0 font-bold">
                    <app-money [amount]="order.total" />
                  </span>
                </div>
                <p class="text-xs" [class]="waitToneClass(order)">
                  Waiting {{ waitLabel(pendingSince(order), now()) }}
                </p>
              </div>
            </li>
          }
        </ul>
      }
    </app-drawer>
  `,
})
export class MyPendingSalesComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);

  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  /** Ticks once a minute so wait labels and aging tones stay current. */
  protected readonly now = signal(Date.now());

  private channel: RealtimeChannel | null = null;
  private nowTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    void this.load();
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
    this.channel = this.pos.client
      .channel('my-pending-sales-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => void this.load()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.channel) void this.pos.client.removeChannel(this.channel);
    if (this.nowTimer) clearInterval(this.nowTimer);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.orders.set(await this.pos.myPendingSales());
    } catch {
      // Keep the last list; the chip is a nudge, not a source of truth.
    } finally {
      this.loading.set(false);
    }
  }

  protected customerName(order: OrderWithCustomer): string {
    if (!order.customers) return 'Walk-in';
    return [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ');
  }

  /** When the sale was handed to the cashier; falls back to creation time. */
  protected pendingSince(order: OrderWithCustomer): string {
    return order.cashier_pending_at ?? order.created_at;
  }

  protected ageOf(order: OrderWithCustomer): QueueAge {
    return queueAge(this.pendingSince(order), this.now());
  }

  protected waitToneClass(order: OrderWithCustomer): string {
    const age = this.ageOf(order);
    if (age === 'stale') return 'text-error font-semibold';
    if (age === 'aging') return 'text-warning';
    return 'text-base-content/60';
  }

  protected readonly waitLabel = waitLabel;
}
