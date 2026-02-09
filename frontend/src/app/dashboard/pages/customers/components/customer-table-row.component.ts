import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import { EntityAvatarComponent } from '../../../components/shared/entity-avatar.component';
import { StatusBadgeComponent } from '../../../components/shared/status-badge.component';
import { CustomerAction } from './customer-card.component';

@Component({
  selector: 'tr[app-customer-table-row]',
  imports: [EntityAvatarComponent, StatusBadgeComponent],
  templateUrl: './customer-table-row.component.html',
  styleUrl: './customer-table-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hover cursor-pointer',
    '(click)': 'onRowClick()',
  },
})
export class CustomerTableRowComponent {
  customer = input.required<any>();
  action = output<{ action: CustomerAction; customerId: string }>();

  readonly currencyService = inject(CurrencyService);

  onAction(action: CustomerAction): void {
    this.action.emit({ action, customerId: this.customer().id });
  }

  onRowClick(): void {
    this.action.emit({ action: 'view', customerId: this.customer().id });
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

  getCreditLimit(): number {
    return Number(this.customer().customFields?.creditLimit ?? 0);
  }

  /**
   * Outstanding amount from ledger (AR account balance)
   * This is a snapshot from the customer list query - may be stale
   * For real-time data, use CustomerCreditService.getCreditSummary()
   */
  getOutstandingAmount(): number {
    return Number(this.customer().outstandingAmount ?? 0);
  }

  /** Frozen = not approved and outstanding ≠ 0 (inferred). */
  isCreditFrozen(): boolean {
    return !this.isCreditApproved() && this.getOutstandingAmount() !== 0;
  }

  /**
   * Available credit calculated locally for display purposes only
   * NOTE: This is calculated from snapshot data and may be stale
   * For accurate validation, always use CustomerCreditService.getCreditSummary()
   * which queries the ledger directly
   */
  getAvailableCredit(): number {
    const creditLimit = this.getCreditLimit();
    const outstanding = Math.abs(this.getOutstandingAmount());
    return Math.max(creditLimit - outstanding, 0);
  }

  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  readonly Math = Math;
}
