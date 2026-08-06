import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../shared/services/currency.service';
import { toDisplayDate } from '../../../shared/utils/date.util';
import {
  DetailSectionComponent,
  type DetailStat,
} from '../../../shared/components/dashboard/detail-section.component';
import { EntityAvatarComponent } from '../../../shared/components/dashboard/entity-avatar.component';
import { StatusBadgeComponent } from '../../../shared/components/dashboard/status-badge.component';

/**
 * Supplier View Modal Component
 *
 * Mobile-optimized modal for viewing complete supplier information
 */
@Component({
  selector: 'app-supplier-view-modal',
  standalone: true,
  imports: [NgIcon, DetailSectionComponent, EntityAvatarComponent, StatusBadgeComponent],
  templateUrl: './supplier-view-modal.component.html',
  styleUrl: './supplier-view-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierViewModalComponent {
  private readonly currencyService = inject(CurrencyService);

  // Inputs
  readonly supplier = input.required<any>();

  // Outputs
  readonly editRequested = output<string>();
  readonly deleteRequested = output<string>();
  readonly viewPurchasesRequested = output<string>();
  readonly recordPaymentRequested = output<string>();

  // Modal reference
  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  /**
   * Show the modal
   */
  show(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'DIALOG') {
      this.hide();
    }
  }

  /**
   * Get full name
   */
  getFullName(): string {
    const s = this.supplier();
    return `${s.firstName || ''} ${s.lastName || ''}`.trim();
  }

  /**
   * Check if verified
   */
  isVerified(): boolean {
    return Boolean(this.supplier().user?.verified);
  }

  /**
   * Get supplier code
   */
  getSupplierCode(): string {
    return this.supplier().customFields?.supplierCode || 'N/A';
  }

  /**
   * Get supplier type
   */
  getSupplierType(): string {
    return this.supplier().customFields?.supplierType || 'General';
  }

  /**
   * Get contact person
   */
  getContactPerson(): string | null {
    return this.supplier().customFields?.contactPerson || null;
  }

  /**
   * Get payment terms
   */
  getPaymentTerms(): string | null {
    return this.supplier().customFields?.paymentTerms || null;
  }

  /**
   * Get notes
   */
  getNotes(): string | null {
    return this.supplier().customFields?.notes || null;
  }

  /**
   * Get addresses
   */
  getAddresses(): any[] {
    return this.supplier().addresses || [];
  }

  /**
   * Format date
   */
  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    return toDisplayDate(dateString, 'medium');
  }

  /**
   * Format address
   */
  formatAddress(address: any): string {
    const parts = [];
    if (address.streetLine1) parts.push(address.streetLine1);
    if (address.streetLine2) parts.push(address.streetLine2);
    if (address.city) parts.push(address.city);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);
    return parts.join(', ');
  }

  /**
   * Handle action requests
   */
  onEdit(): void {
    this.editRequested.emit(this.supplier().id);
    this.hide();
  }

  onDelete(): void {
    this.deleteRequested.emit(this.supplier().id);
    this.hide();
  }

  isSupplierCreditApproved(): boolean {
    return Boolean(this.supplier().customFields?.isSupplierCreditApproved);
  }

  /**
   * Payable balance (AP). Sign convention matches supplier-table-row:
   * < 0 → owed to the supplier, > 0 → we hold credit with them.
   */
  getOutstandingAmount(): number {
    return Number(this.supplier().supplierOutstandingAmount ?? 0);
  }

  getOutstandingAmountAbs(): number {
    return Math.abs(this.getOutstandingAmount());
  }

  getSupplierCreditLimit(): number {
    return Number(this.supplier().customFields?.supplierCreditLimit ?? 0);
  }

  getSupplierAvailableCredit(): number {
    const limit = this.getSupplierCreditLimit();
    const outstanding = this.getOutstandingAmountAbs();
    return Math.max(limit - outstanding, 0);
  }

  /** Frozen = not approved and balance ≠ 0 (inferred, not stored). */
  isSupplierCreditFrozen(): boolean {
    return !this.isSupplierCreditApproved() && this.getOutstandingAmount() !== 0;
  }

  /** Whether to show the payables/credit section at all. */
  showCreditSection(): boolean {
    return (
      this.isSupplierCreditApproved() ||
      this.getOutstandingAmount() !== 0 ||
      this.getSupplierCreditLimit() > 0
    );
  }

  /** KPI rows under the balance hero — built once so the template just iterates. */
  readonly creditStats = computed<DetailStat[]>(() => {
    const stats: DetailStat[] = [];
    const limit = this.getSupplierCreditLimit();
    if (limit > 0) {
      stats.push({ label: 'Limit', value: this.formatCurrency(limit) });
      if (this.isSupplierCreditApproved()) {
        const available = this.getSupplierAvailableCredit();
        stats.push({
          label: 'Available',
          value: this.formatCurrency(available),
          valueClass: available > 0 ? 'text-success' : 'text-error',
        });
      }
    }
    const terms = this.getPaymentTerms();
    if (terms) {
      stats.push({ label: 'Terms', value: terms });
    }
    return stats;
  });

  /** Format currency (amount in cents). */
  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  onViewPurchases(): void {
    this.viewPurchasesRequested.emit(this.supplier().id);
    this.hide();
  }

  onRecordPayment(): void {
    this.recordPaymentRequested.emit(this.supplier().id);
    this.hide();
  }
}
