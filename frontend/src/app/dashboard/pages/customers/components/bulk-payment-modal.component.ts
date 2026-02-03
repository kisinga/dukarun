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
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '../../../../core/services/currency.service';
import { CustomerService } from '../../../../core/services/customer.service';

/**
 * Bulk Payment Modal Component
 *
 * Mobile-optimized modal for recording bulk payments for credit-approved customers
 */
@Component({
  selector: 'app-bulk-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bulk-payment-modal.component.html',
  styleUrl: './bulk-payment-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkPaymentModalComponent {
  readonly customerService = inject(CustomerService);
  readonly currencyService = inject(CurrencyService);

  // Inputs
  readonly customerId = input.required<string>();
  readonly customerName = input.required<string>();
  readonly outstandingAmount = input<number>(0);
  readonly availableCredit = input<number>(0);

  // Outputs
  readonly paymentRecorded = output<void>();
  readonly cancelled = output<void>();

  // Modal reference - using proper Angular viewChild pattern
  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  // Math utility for template
  readonly Math = Math;

  // Form state
  readonly paymentAmount = signal<number | null>(null);
  readonly referenceNumber = signal<string>('');
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly successResult = signal<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null>(null);

  /**
   * Show the modal
   */
  show(): void {
    // Reset form
    this.paymentAmount.set(null);
    this.referenceNumber.set('');
    this.error.set(null);
    this.successResult.set(null);
    this.isSubmitting.set(false);

    // Show modal using proper viewChild pattern
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
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    const amount = this.paymentAmount();
    const refNumber = this.referenceNumber();

    // Validation
    if (amount === null || amount <= 0) {
      this.error.set('Please enter a valid payment amount');
      return;
    }

    if (!refNumber || refNumber.trim().length === 0) {
      this.error.set('Please enter a reference number');
      return;
    }

    const outstanding = this.outstandingAmount();
    const amountInCents = Math.round(amount * 100);
    if (outstanding > 0 && amountInCents > Math.abs(outstanding)) {
      this.error.set(
        `Payment amount cannot exceed outstanding balance of ${this.currencyService.format(Math.abs(outstanding))}`,
      );
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const result = await this.customerService.recordBulkPayment(
        this.customerId(),
        amountInCents,
        refNumber.trim(),
      );

      if (result) {
        this.successResult.set(result);
        // Auto-close after 3 seconds or emit event
        setTimeout(() => {
          this.paymentRecorded.emit();
          this.hide();
          // Refresh customer list
          this.customerService.fetchCustomers({ take: 100, skip: 0 }).catch(console.error);
        }, 2000);
      } else {
        const serviceError = this.customerService.error();
        this.error.set(serviceError || 'Failed to record payment. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment submission error:', error);
      this.error.set(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Handle cancel
   */
  onCancel(): void {
    this.hide();
    this.cancelled.emit();
  }

  /**
   * Handle close via backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    const modal = this.modalRef()?.nativeElement;
    if (modal && event.target === modal) {
      this.onCancel();
    }
  }

  /**
   * Get reference number value for two-way binding
   */
  get refNumber(): string {
    return this.referenceNumber();
  }

  set refNumber(value: string) {
    this.referenceNumber.set(value);
  }

  /**
   * Format currency for display (amount in cents)
   */
  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  /**
   * Get outstanding amount display
   */
  getOutstandingDisplay(): string {
    const outstanding = this.outstandingAmount();
    if (outstanding === 0) return 'No outstanding balance';
    if (outstanding < 0) {
      return `Outstanding: ${this.formatCurrency(Math.abs(outstanding))}`;
    }
    return `Credit: ${this.formatCurrency(outstanding)}`;
  }
}
