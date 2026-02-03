import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import { EntityAvatarComponent } from '../../../components/shared/entity-avatar.component';
import { StatusBadgeComponent } from '../../../components/shared/status-badge.component';

export type CustomerAction = 'edit' | 'delete' | 'viewOrders' | 'recordPayment' | 'view';

@Component({
  selector: 'app-customer-card',
  imports: [EntityAvatarComponent, StatusBadgeComponent],
  templateUrl: './customer-card.component.html',
  styleUrl: './customer-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerCardComponent {
  customer = input.required<any>();
  action = output<{ action: CustomerAction; customerId: string }>();

  readonly currencyService = inject(CurrencyService);

  onAction(action: CustomerAction): void {
    this.action.emit({ action, customerId: this.customer().id });
  }

  getFullName(): string {
    const c = this.customer();
    return `${c.firstName || ''} ${c.lastName || ''}`.trim();
  }

  isVerified(): boolean {
    return this.customer().user?.verified || false;
  }

  isWalkInCustomer(): boolean {
    const c = this.customer();
    if (!c) return false;
    const email = c.emailAddress?.toLowerCase() || '';
    const firstName = c.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  }

  isCreditApproved(): boolean {
    return Boolean(this.customer().customFields?.isCreditApproved);
  }

  /**
   * Outstanding amount from ledger (AR account balance)
   * This is a snapshot from the customer list query - may be stale
   * For real-time data, use CustomerCreditService.getCreditSummary()
   */
  getOutstandingAmount(): number {
    return Number(this.customer().outstandingAmount ?? 0);
  }

  getOutstandingAmountAbs(): number {
    return Math.abs(this.getOutstandingAmount());
  }

  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }
}
