import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HoverPreviewHostComponent } from '../../../shared/components/dashboard/hover-preview-host/hover-preview-host.component';
import { MoneyComponent } from '../../../shared/components/money.component';
import { OrderStateBadgeComponent } from './order-state-badge.component';
import { toDisplayDate } from '../../../shared/utils/date.util';

export interface OrderCardData {
  id: string;
  code: string;
  state: string;
  createdAt: string;
  orderPlacedAt?: string | null;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  amountOwing?: number;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string | null;
  } | null;
  lines: Array<{
    id: string;
    quantity: number;
    productVariant: {
      id: string;
      name: string;
    };
  }>;
  payments?: Array<{
    id: string;
    state: string;
    amount: number;
    method: string;
    createdAt: string;
  }> | null;
  customFields?: { reversedAt?: string | null } | null;
}

export type OrderAction = 'view' | 'print' | 'pay' | 'void';

@Component({
  selector: 'app-order-card',
  imports: [
    OrderStateBadgeComponent,
    RouterLink,
    HoverPreviewHostComponent,
    NgIcon,
    MoneyComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-base-100 border border-base-300/60 rounded-xl cursor-pointer
             transition-colors hover:bg-base-200/30 active:bg-base-200/50 p-3"
      (click)="navigateToOrder()"
    >
      <!-- Code + state -->
      <div class="flex items-start justify-between gap-2">
        <h3 class="min-w-0 truncate font-mono text-sm font-bold leading-tight">
          {{ order().code }}
        </h3>
        <app-order-state-badge
          [state]="order().state"
          [outstandingAmount]="amountOwing()"
          [reversedAt]="order().customFields?.reversedAt ?? null"
        />
      </div>

      <!-- Meta + amount -->
      <div class="mt-1.5 flex items-end justify-between gap-3">
        <div class="min-w-0 text-xs text-base-content/60">
          <div class="flex items-center gap-1.5">
            <span class="shrink-0">
              {{ getItemCount() }} {{ getItemCount() === 1 ? 'item' : 'items' }}
            </span>
            <span class="w-1 h-1 rounded-full bg-base-content/30 shrink-0"></span>
            @if (order().customer?.id) {
              <app-hover-preview-host
                previewKey="customer"
                [entityId]="order().customer!.id"
                class="min-w-0"
              >
                <a
                  [routerLink]="['/dashboard/customers', order().customer!.id]"
                  class="link link-hover block truncate"
                  (click)="$event.stopPropagation()"
                  >{{ getCustomerName() }}</a
                >
              </app-hover-preview-host>
            } @else {
              <span class="truncate">{{ getCustomerName() }}</span>
            }
          </div>
          <div class="mt-0.5 text-base-content/45">
            {{ formatDate(order().orderPlacedAt || order().createdAt) }}
          </div>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-base font-bold tabular-nums">
            <app-money [value]="order().totalWithTax" />
          </p>
          @if (amountOwing() > 0) {
            <p class="text-xs font-medium text-warning">
              Due <app-money [value]="amountOwing()" />
            </p>
          }
        </div>
      </div>

      <!-- Actions -->
      @if (canPay() || canPrint() || canVoid()) {
        <div class="mt-2.5 flex items-center gap-2 border-t border-base-300/50 pt-2.5">
          @if (canPay()) {
            <button
              type="button"
              (click)="onAction('pay'); $event.stopPropagation()"
              class="btn btn-success btn-xs"
            >
              Pay
            </button>
          }
          @if (canPrint()) {
            <button
              type="button"
              (click)="onAction('print'); $event.stopPropagation()"
              class="btn btn-ghost btn-xs gap-1"
            >
              <ng-icon name="heroPrinter" size="1rem" />
              Print
            </button>
          }
          @if (canVoid()) {
            <button
              type="button"
              (click)="onAction('void'); $event.stopPropagation()"
              class="btn btn-ghost btn-error btn-xs ml-auto"
            >
              Void
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class OrderCardComponent {
  private readonly router = inject(Router);
  readonly order = input.required<OrderCardData>();
  readonly action = output<{ action: OrderAction; orderId: string }>();

  getCustomerName(): string {
    const customer = this.order().customer;
    if (!customer) return 'Walk-in Customer';
    return `${customer.firstName} ${customer.lastName}`.trim() || 'Walk-in Customer';
  }

  getItemCount(): number {
    return this.order().lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  formatDate(dateString: string): string {
    return toDisplayDate(dateString, 'medium');
  }

  canPrint(): boolean {
    return this.order().state !== 'Draft';
  }

  canVoid(): boolean {
    const order = this.order();
    return (
      order.state !== 'Draft' &&
      order.state !== 'Cancelled' &&
      !(order.customFields?.reversedAt != null)
    );
  }

  readonly amountOwing = computed(() => this.order().amountOwing ?? 0);

  readonly canPay = computed(() => {
    const order = this.order();
    if (order.state !== 'ArrangingPayment') return false;
    if (!order.customer) return false;

    return this.amountOwing() > 0;
  });

  navigateToOrder(): void {
    this.router.navigate(['/dashboard/orders', this.order().id]);
  }

  onAction(actionType: OrderAction): void {
    this.action.emit({ action: actionType, orderId: this.order().id });
  }
}
