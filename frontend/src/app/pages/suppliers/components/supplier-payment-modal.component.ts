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
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { LedgerService } from '@dukarun/ledger';
import { CurrencyService } from '../../../shared/services/currency.service';
import {
  PurchasePaymentService,
  SupplierCreditSummary,
  AllocateBulkSupplierPaymentResult,
} from '@dukarun/purchases';

/**
 * Supplier Payment Modal Component
 *
 * Records a bulk payment for a credit-approved supplier (allocates across unpaid purchases).
 */
@Component({
  selector: 'app-supplier-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon],
  templateUrl: './supplier-payment-modal.component.html',
  styleUrl: './supplier-payment-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierPaymentModalComponent {
  private readonly purchasePaymentService = inject(PurchasePaymentService);
  private readonly ledgerService = inject(LedgerService);
  readonly currencyService = inject(CurrencyService);

  readonly supplierId = input.required<string>();
  readonly supplierName = input<string>('');

  readonly paymentRecorded = output<void>();
  readonly cancelled = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly summary = signal<SupplierCreditSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly summaryError = signal<string | null>(null);

  readonly paymentAmount = signal<number | null>(null);
  readonly referenceNumber = signal<string>('');
  readonly selectedAccountCode = signal<string>('');
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);
  readonly isLoadingAccounts = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly successResult = signal<AllocateBulkSupplierPaymentResult | null>(null);

  async show(): Promise<void> {
    this.paymentAmount.set(null);
    this.referenceNumber.set('');
    this.selectedAccountCode.set('');
    this.error.set(null);
    this.successResult.set(null);
    this.summaryError.set(null);
    this.isSubmitting.set(false);

    const sid = this.supplierId();
    if (!sid) return;

    this.summaryLoading.set(true);
    this.summary.set(null);
    try {
      const s = await this.purchasePaymentService.getSupplierCreditSummary(sid);
      this.summary.set(s);
      if (!s) {
        this.summaryError.set('Could not load supplier credit summary');
      }
    } catch (e: any) {
      this.summaryError.set(e?.message || 'Failed to load summary');
    } finally {
      this.summaryLoading.set(false);
    }

    this.isLoadingAccounts.set(true);
    try {
      const items = await firstValueFrom(this.ledgerService.loadEligibleDebitAccounts());
      this.eligibleAccounts.set(items.map((a) => ({ code: a.code, name: a.name })));
    } catch {
      this.eligibleAccounts.set([]);
    } finally {
      this.isLoadingAccounts.set(false);
    }

    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  hide(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }

  async onSubmit(): Promise<void> {
    const amount = this.paymentAmount();
    const refNumber = this.referenceNumber();
    const accountCode = this.selectedAccountCode().trim();

    if (amount === null || amount <= 0) {
      this.error.set('Please enter a valid payment amount');
      return;
    }

    if (!accountCode) {
      this.error.set('Please select a payment source account');
      return;
    }

    if (!refNumber?.trim()) {
      this.error.set('Please enter a reference number');
      return;
    }

    const outstanding = this.summary()?.outstandingAmount ?? 0;
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
      const result = await this.purchasePaymentService.allocateBulkSupplierPayment(
        this.supplierId(),
        amountInCents,
        accountCode,
        undefined,
        refNumber.trim(),
      );

      if (result) {
        this.successResult.set(result);
        setTimeout(() => {
          this.paymentRecorded.emit();
          this.hide();
        }, 2000);
      } else {
        this.error.set('Failed to record payment. Please try again.');
      }
    } catch (e: any) {
      this.error.set(e?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.hide();
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    const modal = this.modalRef()?.nativeElement;
    if (modal && event.target === modal) {
      this.onCancel();
    }
  }

  get refNumber(): string {
    return this.referenceNumber();
  }

  set refNumber(value: string) {
    this.referenceNumber.set(value);
  }

  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  getOutstandingDisplay(): string {
    const s = this.summary();
    if (!s) return '—';
    const outstanding = s.outstandingAmount;
    if (outstanding === 0) return 'No outstanding balance';
    if (outstanding < 0) {
      return `Outstanding: ${this.formatCurrency(Math.abs(outstanding))}`;
    }
    return `Outstanding: ${this.formatCurrency(outstanding)}`;
  }
}
