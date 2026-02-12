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

/**
 * Supplier View Modal Component
 *
 * Mobile-optimized modal for viewing complete supplier information
 */
@Component({
  selector: 'app-supplier-view-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './supplier-view-modal.component.html',
  styleUrl: './supplier-view-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierViewModalComponent {
  // Inputs
  readonly supplier = input.required<any>();

  // Outputs
  readonly editRequested = output<string>();
  readonly deleteRequested = output<string>();
  readonly viewPurchasesRequested = output<string>();
  readonly recordPaymentRequested = output<string>();

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
    const s = this.supplier();
    return `${s.firstName || ''} ${s.lastName || ''}`.trim();
  }

  /**
   * Get initials
   */
  getInitials(): string {
    const s = this.supplier();
    const first = s.firstName?.charAt(0) || '';
    const last = s.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
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
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
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

  /** Whether supplier has credit approval (customer credit fields - same as edit form). */
  isSupplierCreditApproved(): boolean {
    return Boolean(this.supplier().customFields?.isCreditApproved);
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
