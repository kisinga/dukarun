import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HoverPreviewHostComponent } from '../../../components/shared/hover-preview-host/hover-preview-host.component';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrderStateBadgeComponent } from './order-state-badge.component';
import { getOrderAmountOwing } from '../utils/order-payment.util';
import { toDisplayDate } from '../../../../core/utils/date.util';

export interface OrderCardData {
  id: string;
  code: string;
  state: string;
  createdAt: string;
  orderPlacedAt?: string | null;
  total: number;
  totalWithTax: number;
  currencyCode: string;
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
  imports: [OrderStateBadgeComponent, RouterLink, HoverPreviewHostComponent, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-base-100 border border-base-300 rounded-xl shadow-sm cursor-pointer
             transition-colors hover:bg-base-200/30 active:bg-base-200/50"
      (click)="navigateToOrder()"
    >
      <div class="p-4">
        <div class="flex gap-3">
          <div class="avatar shrink-0">
            <div
              class="w-14 h-14 rounded-lg ring-2 ring-base-300 ring-offset-1 bg-base-200 flex items-center justify-center"
            >
              <ng-icon name="heroDocumentText" size="1.75rem" class="text-primary" />
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="text-base font-bold line-clamp-1 leading-tight">{{ order().code }}</h3>
              <app-order-state-badge
                [state]="order().state"
                [reversedAt]="order().customFields?.reversedAt ?? null"
              />
            </div>
            <div class="flex items-center gap-2 mb-1 text-xs text-base-content/60">
              <span>{{ getItemCount() }} items</span>
              <span class="w-1 h-1 rounded-full bg-base-content/30"></span>
              @if (order().customer?.id) {
                <app-hover-preview-host previewKey="customer" [entityId]="order().customer!.id">
                  <a
                    [routerLink]="['/dashboard/customers', order().customer!.id]"
                    class="link link-hover"
                    (click)="$event.stopPropagation()"
                    >{{ getCustomerName() }}</a
                  >
                </app-hover-preview-host>
              } @else if (order().customer) {
                <span>{{ getCustomerName() }}</span>
              } @else {
                <span>Walk-in</span>
              }
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-base-content/50">
                {{ formatDate(order().orderPlacedAt || order().createdAt) }}
              </p>
              <div class="text-right">
                <p class="text-lg font-bold text-primary font-mono tracking-tight">
                  {{ formatCurrency(order().totalWithTax) }}
                </p>
                @if (amountOwing() > 0) {
                  <p class="text-xs font-medium text-warning">
                    Due {{ formatCurrency(amountOwing()) }}
                  </p>
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      @if (canPay() || canPrint() || canVoid()) {
        <div class="border-t border-base-300/50 px-4 py-2 flex justify-end gap-2">
          @if (canPay()) {
            <button
              type="button"
              (click)="onAction('pay'); $event.stopPropagation()"
              class="btn btn-success btn-xs gap-1"
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
              class="btn btn-ghost btn-error btn-xs gap-1"
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
  private readonly currencyService = inject(CurrencyService);
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

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
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

  readonly amountOwing = computed(() => getOrderAmountOwing(this.order()));

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
