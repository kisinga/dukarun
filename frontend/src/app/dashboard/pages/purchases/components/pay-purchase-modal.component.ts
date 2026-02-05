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
import { firstValueFrom } from 'rxjs';
import { CashierSessionService } from '../../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../../core/services/company.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { LedgerService } from '../../../../core/services/ledger/ledger.service';
import {
  PurchasePaymentService,
  PaySinglePurchaseResult,
} from '../../../../core/services/purchase/purchase-payment.service';

export interface PayPurchaseModalData {
  purchaseId: string;
  purchaseReference: string;
  supplierName: string;
  /** Total cost in cents (used as default/cap for amount) */
  totalCost: number;
}

/**
 * Pay Purchase Modal
 *
 * Record payment for a single credit purchase. Reuses eligible-accounts (pay from) and amount pattern.
 */
@Component({
  selector: 'app-pay-purchase-modal',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <h3 class="text-lg font-bold text-base-content">Pay Purchase</h3>
          <form method="dialog">
            <button
              type="submit"
              class="btn btn-sm btn-circle btn-ghost"
              [disabled]="isProcessing()"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </form>
        </div>

        <div class="mb-4 p-3 sm:p-4 bg-base-200 rounded-lg">
          <div class="text-sm sm:text-base font-semibold text-base-content mb-1">
            {{ purchaseData()?.purchaseReference || purchaseData()?.purchaseId }}
          </div>
          <div class="text-xs text-base-content/70">{{ purchaseData()?.supplierName }}</div>
          <div class="text-xs text-base-content/60 mt-1">
            Total: {{ formatCurrency(purchaseData()?.totalCost ?? 0) }}
          </div>
        </div>

        @if (successResult()) {
          <div class="alert alert-success mb-4">
            <span class="font-semibold">Payment recorded.</span>
            <span class="text-xs mt-1"
              >Allocated: {{ formatCurrency(successResult()!.totalAllocated) }}</span
            >
          </div>
          <div class="modal-action pt-4">
            <button type="button" class="btn btn-primary w-full" (click)="onClose()">Close</button>
          </div>
        } @else {
          @if (error()) {
            <div class="alert alert-error mb-4">
              <span class="text-sm">{{ error() }}</span>
            </div>
          }

          @if (!cashierSessionService.hasActiveSession()) {
            <div class="alert alert-warning mb-4">
              <span>Open a session to record payments (Dashboard → Open shift).</span>
            </div>
          }

          <form (ngSubmit)="onConfirmPayment()" class="space-y-4">
            <div class="form-control">
              <label class="label" for="paymentAmount">
                <span class="label-text font-semibold">Amount to pay</span>
                <span class="label-text-alt text-base-content/60"
                  >Max: {{ formatCurrency(purchaseData()?.totalCost ?? 0) }}</span
                >
              </label>
              <input
                id="paymentAmount"
                type="text"
                inputmode="decimal"
                placeholder="Full amount or enter less for partial"
                [value]="paymentAmountInput()"
                (input)="onPaymentAmountInput($any($event.target).value)"
                class="input input-bordered w-full"
                [disabled]="isProcessing()"
              />
            </div>

            <div class="form-control">
              <label class="label" for="payFromAccount">
                <span class="label-text font-semibold">Pay from (source of funds)</span>
                <span class="label-text-alt text-base-content/60">Optional</span>
              </label>
              <select
                id="payFromAccount"
                [value]="selectedAccountCode()"
                (change)="selectedAccountCode.set($any($event.target).value)"
                class="select select-bordered w-full"
                [disabled]="isProcessing() || isLoadingAccounts()"
              >
                <option value="">Default (Cash)</option>
                @for (acc of eligibleAccounts(); track acc.code) {
                  <option [value]="acc.code">{{ acc.name }} ({{ acc.code }})</option>
                }
              </select>
              <label class="label">
                <span class="label-text-alt text-base-content/60"
                  >Account to debit (e.g. Cash, M-Pesa).</span
                >
              </label>
            </div>

            @if (isProcessing()) {
              <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-lg"></span>
                <span class="ml-2 text-sm text-base-content/60">Processing...</span>
              </div>
            }

            <div class="modal-action pt-4 flex-col gap-2">
              <button
                type="submit"
                class="btn btn-primary w-full"
                [class.loading]="isProcessing()"
                [disabled]="
                  isProcessing() ||
                  !cashierSessionService.hasActiveSession() ||
                  getEffectiveAmountCents() <= 0
                "
              >
                {{ isProcessing() ? 'Processing...' : 'Confirm Payment' }}
              </button>
              <button
                type="button"
                class="btn btn-ghost w-full"
                (click)="onCancel()"
                [disabled]="isProcessing()"
              >
                Cancel
              </button>
            </div>
          </form>
        }
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class PayPurchaseModalComponent {
  private readonly paymentService = inject(PurchasePaymentService);
  readonly currencyService = inject(CurrencyService);
  private readonly ledgerService = inject(LedgerService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);

  readonly purchaseData = input<PayPurchaseModalData | null>(null);
  readonly paymentRecorded = output<void>();
  readonly cancelled = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly paymentAmountInput = signal<string>('');
  readonly selectedAccountCode = signal<string>('');
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);
  readonly isLoadingAccounts = signal(false);
  readonly successResult = signal<PaySinglePurchaseResult | null>(null);

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents);
  }

  onPaymentAmountInput(value: string): void {
    this.paymentAmountInput.set(value ?? '');
  }

  getEffectiveAmountCents(): number {
    const data = this.purchaseData();
    if (!data) return 0;
    const maxCents = data.totalCost;
    const raw = this.paymentAmountInput().trim().replace(/,/g, '');
    if (!raw) return maxCents;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.min(Math.round(parsed * 100), maxCents);
  }

  onBackdropClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target?.tagName === 'DIALOG') (target as HTMLDialogElement).close();
  }

  async show(): Promise<void> {
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    this.paymentAmountInput.set('');
    this.selectedAccountCode.set('');

    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        await firstValueFrom(this.cashierSessionService.getCurrentSession(channelId));
      }
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

    this.modalRef()?.nativeElement?.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement?.close();
  }

  async onConfirmPayment(): Promise<void> {
    const data = this.purchaseData();
    if (!data) return;

    const amountCents = this.getEffectiveAmountCents();
    if (amountCents <= 0) {
      this.error.set('Enter a valid amount to pay.');
      return;
    }

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const result = await this.paymentService.paySinglePurchase(
        data.purchaseId,
        amountCents,
        this.selectedAccountCode()?.trim() || undefined,
      );

      if (result) {
        this.successResult.set(result);
        setTimeout(() => {
          this.paymentRecorded.emit();
          this.hide();
        }, 1500);
      } else {
        this.error.set('Failed to record payment. Please try again.');
      }
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to record payment.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  onCancel(): void {
    this.hide();
    this.cancelled.emit();
  }

  onClose(): void {
    this.hide();
    this.paymentRecorded.emit();
  }
}
