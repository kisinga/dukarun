import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PaymentWithOrder } from '../../../../core/services/payments.service';
import { PaymentStateBadgeComponent } from './payment-state-badge.component';

export type PaymentAction = 'view' | 'viewOrder';

/**
 * Payment Table Row Component for desktop view
 */
@Component({
  selector: 'tr[app-payment-table-row]',
  imports: [CommonModule, RouterLink, PaymentStateBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <td>
      <a
        [routerLink]="['/dashboard/orders', payment().order.id]"
        class="link link-hover font-medium"
        >{{ payment().order.code }}</a
      >
      <div class="text-sm text-base-content/60">{{ formatDate(payment().createdAt) }}</div>
    </td>
    <td>
      @if (payment().order.customer?.id) {
        <a
          [routerLink]="['/dashboard/customers', payment().order.customer!.id]"
          class="link link-hover"
          >{{ getCustomerName() }}</a
        >
      } @else if (payment().order.customer) {
        <div>{{ getCustomerName() }}</div>
      } @else {
        <span class="text-base-content/60">Walk-in</span>
      }
    </td>
    <td>{{ payment().method }}</td>
    <td class="text-right font-medium">{{ formatCurrency(payment().amount) }}</td>
    <td>
      <app-payment-state-badge [state]="payment().state" />
    </td>
    <td>
      @if (payment().transactionId) {
        <span class="font-mono text-xs">{{ truncateId(payment().transactionId) }}</span>
      } @else {
        <span class="text-base-content/60">—</span>
      }
    </td>
    <td class="text-right">
      <div class="flex gap-2 justify-end">
        <button class="btn btn-sm btn-primary" (click)="onAction('view')">View Payment</button>
        <button class="btn btn-sm btn-outline" (click)="onAction('viewOrder')">View Order</button>
      </div>
    </td>
  `,
})
export class PaymentTableRowComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly payment = input.required<PaymentWithOrder>();
  readonly action = output<{ action: PaymentAction; paymentId: string; orderId?: string }>();

  getCustomerName(): string {
    const customer = this.payment().order.customer;
    if (!customer) return 'Walk-in Customer';
    return `${customer.firstName} ${customer.lastName}`.trim() || 'Walk-in Customer';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }

  truncateId(id: string | null | undefined): string {
    if (!id) return '';
    return id.length > 12 ? `${id.substring(0, 12)}...` : id;
  }

  onAction(actionType: PaymentAction): void {
    if (actionType === 'viewOrder') {
      this.action.emit({
        action: actionType,
        paymentId: this.payment().id,
        orderId: this.payment().order.id,
      });
    } else {
      this.action.emit({ action: actionType, paymentId: this.payment().id });
    }
  }
}
