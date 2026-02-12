import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { EntityAvatarComponent } from '../../../components/shared/entity-avatar.component';
import { StatusBadgeComponent } from '../../../components/shared/status-badge.component';
import { CurrencyService } from '../../../../core/services/currency.service';
import { SupplierAction } from './supplier-card.component';

@Component({
  selector: 'tr[app-supplier-table-row]',
  imports: [EntityAvatarComponent, StatusBadgeComponent],
  templateUrl: './supplier-table-row.component.html',
  styleUrl: './supplier-table-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hover cursor-pointer',
    '(click)': 'onRowClick()',
  },
})
export class SupplierTableRowComponent {
  private readonly currencyService = inject(CurrencyService);
  supplier = input.required<any>();
  action = output<{ action: SupplierAction; supplierId: string }>();

  onAction(action: SupplierAction): void {
    this.action.emit({ action, supplierId: this.supplier().id });
  }

  onRowClick(): void {
    this.action.emit({ action: 'view', supplierId: this.supplier().id });
  }

  getFullName(): string {
    const s = this.supplier();
    return `${s.firstName || ''} ${s.lastName || ''}`.trim();
  }

  getAddressCount(): number {
    return this.supplier().addresses?.length || 0;
  }

  isVerified(): boolean {
    return this.supplier().user?.verified || false;
  }

  getSupplierCode(): string {
    return this.supplier().customFields?.supplierCode || 'N/A';
  }

  getSupplierType(): string {
    return this.supplier().customFields?.supplierType || 'General';
  }

  isSupplierCreditApproved(): boolean {
    return Boolean(this.supplier().customFields?.isSupplierCreditApproved);
  }

  getSupplierOutstandingAmount(): number {
    return Number(this.supplier().supplierOutstandingAmount ?? 0);
  }

  getSupplierCreditLimit(): number {
    return Number(this.supplier().customFields?.supplierCreditLimit ?? 0);
  }

  getSupplierAvailableCredit(): number {
    const limit = this.getSupplierCreditLimit();
    const outstanding = Math.abs(this.getSupplierOutstandingAmount());
    return Math.max(limit - outstanding, 0);
  }

  /** Frozen = not approved and balance ≠ 0 (inferred). */
  isSupplierCreditFrozen(): boolean {
    return !this.isSupplierCreditApproved() && this.getSupplierOutstandingAmount() !== 0;
  }

  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  readonly Math = Math;
}
