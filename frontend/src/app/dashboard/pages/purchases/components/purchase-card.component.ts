import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HoverPreviewHostComponent } from '../../../components/shared/hover-preview-host/hover-preview-host.component';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PurchaseAction, PurchaseCardData } from './purchase-table-row.component';

/**
 * Reusable purchase card component for mobile view
 * Displays purchase summary with key information
 */
@Component({
  selector: 'app-purchase-card',
  imports: [CommonModule, DatePipe, RouterLink, HoverPreviewHostComponent],
  templateUrl: './purchase-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCardComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
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

  navigateToPurchase(): void {
    this.router.navigate(['/dashboard/purchases', this.purchase().id]);
  }

  onAction(actionType: PurchaseAction, event?: Event): void {
    event?.stopPropagation();
    this.action.emit({ action: actionType, purchaseId: this.purchase().id });
  }
}
