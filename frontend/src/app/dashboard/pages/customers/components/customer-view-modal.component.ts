import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Customer View Modal Component
 *
 * Mobile-optimized modal for viewing complete customer information
 */
@Component({
  selector: 'app-customer-view-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './customer-view-modal.component.html',
  styleUrl: './customer-view-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerViewModalComponent {
  readonly currencyService = inject(CurrencyService);

  // Inputs
  readonly customer = input.required<any>();

  // Outputs
  readonly editRequested = output<string>();
  readonly recordPaymentRequested = output<string>();
  readonly viewOrdersRequested = output<string>();
  readonly viewPaymentsRequested = output<string>();
  readonly statementRequested = output<string>();

  // Modal reference
  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  // UI state
  readonly expandedSections = signal<Set<string>>(new Set(['basic']));

  /**
   * Toggle section expansion
   */
  toggleSection(section: string): void {
    const expanded = new Set(this.expandedSections());
    if (expanded.has(section)) {
      expanded.delete(section);
    } else {
      expanded.add(section);
    }
    this.expandedSections.set(expanded);
  }

  /**
   * Check if section is expanded
   */
  isExpanded(section: string): boolean {
    return this.expandedSections().has(section);
  }

  /**
   * Show the modal
   */
  show(): void {
    // Reset expanded sections
    this.expandedSections.set(new Set(['basic']));

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
    const c = this.customer();
    return `${c.firstName || ''} ${c.lastName || ''}`.trim();
  }

  /**
   * Get initials
   */
  getInitials(): string {
    const c = this.customer();
    const first = c.firstName?.charAt(0) || '';
    const last = c.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  /**
   * Check if verified
   */
  isVerified(): boolean {
    return Boolean(this.customer().user?.verified);
  }

  /**
   * Check if walk-in customer
   */
  isWalkInCustomer(): boolean {
    const c = this.customer();
    const email = c.emailAddress?.toLowerCase() || '';
    const firstName = c.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  }

  /**
   * Credit information methods
   */
  isCreditApproved(): boolean {
    return Boolean(this.customer().customFields?.isCreditApproved);
  }

  getCreditLimit(): number {
    return Number(this.customer().customFields?.creditLimit ?? 0);
  }

  /**
   * Outstanding amount from ledger (AR account balance)
   * This is a snapshot - for real-time data, use CustomerCreditService.getCreditSummary()
   */
  getOutstandingAmount(): number {
    return Number(this.customer().outstandingAmount ?? 0);
  }

  getOutstandingAmountAbs(): number {
    return Math.abs(this.getOutstandingAmount());
  }

  /**
   * Available credit calculated locally for display purposes only
   * NOTE: This is calculated from snapshot data and may be stale
   * For accurate validation, always use CustomerCreditService.getCreditSummary()
   * which queries the ledger directly
   */
  getAvailableCredit(): number {
    const creditLimit = this.getCreditLimit();
    const outstanding = this.getOutstandingAmountAbs();
    return Math.max(creditLimit - outstanding, 0);
  }

  getLastRepaymentDate(): string | null {
    return this.customer().customFields?.lastRepaymentDate ?? null;
  }

  getLastRepaymentAmount(): number {
    return Number(this.customer().customFields?.lastRepaymentAmount ?? 0);
  }

  getCreditDuration(): number {
    return Number(this.customer().customFields?.creditDuration ?? 0);
  }

  /** Frozen = not approved and outstanding ≠ 0 (inferred, not stored). */
  isCreditFrozen(): boolean {
    return !this.isCreditApproved() && this.getOutstandingAmount() !== 0;
  }

  /** Whether to show the credit section at all. */
  showCreditSection(): boolean {
    return (
      this.isCreditApproved() ||
      this.getOutstandingAmount() !== 0 ||
      this.getCreditLimit() > 0 ||
      this.isCreditFrozen()
    );
  }

  /**
   * Get addresses
   */
  getAddresses(): any[] {
    return this.customer().addresses || [];
  }

  /**
   * Format date
   */
  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  /**
   * Format currency (amount in cents)
   */
  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
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
    const customerId = this.customer().id;
    if (!this.isWalkInCustomer()) {
      this.editRequested.emit(customerId);
      this.hide();
    }
  }

  onRecordPayment(): void {
    this.recordPaymentRequested.emit(this.customer().id);
    this.hide();
  }

  onViewOrders(): void {
    this.viewOrdersRequested.emit(this.customer().id);
    this.hide();
  }

  onViewPayments(): void {
    this.viewPaymentsRequested.emit(this.customer().id);
    this.hide();
  }

  onStatement(): void {
    this.statementRequested.emit(this.customer().id);
    this.hide();
  }
}
