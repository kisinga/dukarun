import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

export type PurchaseAction = 'view' | 'pay' | 'edit' | 'delete';

export interface PurchaseCardData {
  id: string;
  supplierId: string;
  supplier?: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string;
  };
  purchaseDate: string;
  referenceNumber?: string | null;
  totalCost: number;
  paymentStatus: string;
  isCreditPurchase: boolean;
  createdAt: string;
}

/**
 * Purchase table row component for desktop view
 * Compact row representation with action buttons
 */
@Component({
  selector: '[app-purchase-table-row]',
  imports: [CommonModule, DatePipe],
  host: {
    class: 'hover',
  },
  templateUrl: './purchase-table-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseTableRowComponent {
  private readonly currencyService = inject(CurrencyService);

  readonly purchase = input.required<PurchaseCardData>();
  readonly action = output<{ action: PurchaseAction; purchaseId: string }>();

  getSupplierName(): string {
    const supplier = this.purchase().supplier;
    if (!supplier) return 'Unknown';
    return (
      `${supplier.firstName} ${supplier.lastName}`.trim() || supplier.emailAddress || 'Unknown'
    );
  }

  formatCurrency(amount: number): string {
    // totalCost is in cents, convert to currency format
    return this.currencyService.format(amount);
  }

  getPaymentStatusBadgeClass(): string {
    const status = this.purchase().paymentStatus.toLowerCase();
    if (status === 'paid') return 'badge-success';
    if (status === 'partial') return 'badge-warning';
    return 'badge-error';
  }

  canPay(): boolean {
    const p = this.purchase();
    return p.isCreditPurchase && p.paymentStatus?.toLowerCase() !== 'paid';
  }

  onAction(actionType: PurchaseAction): void {
    this.action.emit({ action: actionType, purchaseId: this.purchase().id });
  }
}
