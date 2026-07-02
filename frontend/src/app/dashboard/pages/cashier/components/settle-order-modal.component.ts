import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { CashierSessionService } from '../../../../core/services/cashier-session/cashier-session.service';
import {
  CashierSettlementService,
  OrderTenderInput,
} from '../../../../core/services/cashier/cashier-settlement.service';
import { CompanyService } from '../../../../core/services/company.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  PaymentMethod,
  PaymentMethodService,
} from '../../../../core/services/payment-method.service';

export interface SettleOrderModalData {
  orderId: string;
  orderCode: string;
  customerName: string;
  /** Amount owing in smallest currency unit (cents). */
  amountOwing: number;
}

/** One editable tender row in the split-payment form. */
interface TenderRow {
  paymentMethodCode: string;
  amountInput: string; // currency units as typed
  referenceNumber: string;
}

/**
 * Settle Order Modal
 *
 * Collects payment for a parked order using one or more tenders (split payment).
 * Each tender picks a payment method and an amount; the running "left to allocate"
 * total keeps the cashier honest. Submits atomically via settleOrderPayments.
 */
@Component({
  selector: 'app-settle-order-modal',
  imports: [CommonModule, FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-lg w-full mx-4 max-h-[92vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <div>
            <h3 class="text-lg font-bold text-base-content">Collect payment</h3>
            @if (data(); as d) {
              <div class="text-xs text-base-content/60 mt-0.5">
                {{ d.orderCode }} · {{ d.customerName }}
              </div>
            }
          </div>
          <form method="dialog">
            <button
              class="btn btn-sm btn-circle btn-ghost"
              type="submit"
              [disabled]="isProcessing()"
              aria-label="Close"
            >
              <ng-icon name="heroXMark" size="1.25rem" />
            </button>
          </form>
        </div>

        <!-- Amount due / allocation summary -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="p-3 rounded-lg bg-base-200">
            <div class="text-xs text-base-content/60">Amount due</div>
            <div class="text-lg font-bold">{{ formatCurrency(amountOwing()) }}</div>
          </div>
          <div
            class="p-3 rounded-lg"
            [class.bg-success/10]="remainingCents() === 0"
            [class.bg-base-200]="remainingCents() !== 0"
          >
            <div class="text-xs text-base-content/60">Left to allocate</div>
            <div
              class="text-lg font-bold"
              [class.text-success]="remainingCents() === 0"
              [class.text-error]="remainingCents() < 0"
            >
              {{ formatCurrency(remainingCents()) }}
            </div>
          </div>
        </div>

        <!-- Success -->
        @if (successResult(); as res) {
          <div class="alert alert-success mb-4">
            <ng-icon name="heroCheckCircle" size="1.25rem" />
            <div class="flex-1">
              <div class="font-semibold">
                {{ res.fullySettled ? 'Order settled in full' : 'Partial payment recorded' }}
              </div>
              <div class="text-xs mt-1">Collected: {{ formatCurrency(res.amountSettled) }}</div>
              @if (!res.fullySettled) {
                <div class="text-xs">Still owing: {{ formatCurrency(res.remainingOwing) }}</div>
              }
            </div>
          </div>
        }

        <!-- Error -->
        @if (error(); as err) {
          <div class="alert alert-error mb-4">
            <ng-icon name="heroXCircle" size="1.25rem" />
            <span class="text-sm">{{ err }}</span>
          </div>
        }

        <!-- No session warning -->
        @if (!successResult() && !cashierSessionService.hasActiveSession()) {
          <div class="alert alert-warning mb-4">
            <ng-icon name="heroExclamationTriangle" size="1.25rem" />
            <span class="text-sm"
              >Open a shift to collect payments. Go to the Dashboard and click "Open shift"
              first.</span
            >
          </div>
        }

        @if (!successResult()) {
          @if (isLoadingPaymentMethods()) {
            <div class="flex items-center justify-center py-8">
              <span class="loading loading-spinner loading-md"></span>
              <span class="ml-2 text-sm text-base-content/60">Loading payment methods…</span>
            </div>
          } @else if (paymentMethods().length === 0) {
            <div class="alert alert-warning">
              <ng-icon name="heroExclamationTriangle" size="1.25rem" />
              <span class="text-sm">No payment methods available.</span>
            </div>
          } @else {
            <!-- Tender rows -->
            <div class="space-y-3">
              @for (tender of tenders(); track $index; let i = $index) {
                <div class="p-3 rounded-lg border border-base-300 bg-base-100">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-base-content/70"
                      >Payment {{ i + 1 }}</span
                    >
                    @if (tenders().length > 1) {
                      <button
                        type="button"
                        class="btn btn-xs btn-ghost text-error"
                        (click)="removeTender(i)"
                        [disabled]="isProcessing()"
                        aria-label="Remove payment"
                      >
                        <ng-icon name="heroTrash" size="1rem" />
                      </button>
                    }
                  </div>

                  <div class="flex flex-col sm:flex-row gap-2">
                    <select
                      class="select select-bordered select-sm flex-1"
                      [ngModel]="tender.paymentMethodCode"
                      (ngModelChange)="updateTender(i, { paymentMethodCode: $event })"
                      [disabled]="isProcessing()"
                      [attr.aria-label]="'Payment method ' + (i + 1)"
                    >
                      @for (method of paymentMethods(); track method.id) {
                        <option [value]="method.code">{{ method.name }}</option>
                      }
                    </select>

                    <div class="flex gap-2">
                      <input
                        type="text"
                        inputmode="decimal"
                        placeholder="Amount"
                        class="input input-bordered input-sm w-28"
                        [ngModel]="tender.amountInput"
                        (ngModelChange)="updateTender(i, { amountInput: $event })"
                        [disabled]="isProcessing()"
                        [attr.aria-label]="'Amount ' + (i + 1)"
                      />
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        (click)="fillRemaining(i)"
                        [disabled]="isProcessing()"
                        title="Fill remaining"
                      >
                        Rest
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Reference (e.g. M-Pesa code) — optional"
                    class="input input-bordered input-sm w-full mt-2"
                    [ngModel]="tender.referenceNumber"
                    (ngModelChange)="updateTender(i, { referenceNumber: $event })"
                    [disabled]="isProcessing()"
                    [attr.aria-label]="'Reference ' + (i + 1)"
                  />
                </div>
              }
            </div>

            <button
              type="button"
              class="btn btn-sm btn-ghost gap-1 mt-3"
              (click)="addTender()"
              [disabled]="isProcessing() || remainingCents() <= 0"
            >
              <ng-icon name="heroPlus" size="1rem" />
              Split across another method
            </button>

            <!-- Actions -->
            <div class="modal-action pt-4 flex-col gap-2">
              <button
                type="button"
                class="btn btn-primary w-full"
                [class.loading]="isProcessing()"
                (click)="onConfirm()"
                [disabled]="!canSubmit()"
              >
                @if (isProcessing()) {
                  Processing…
                } @else {
                  Collect {{ formatCurrency(totalTenderedCents()) }}
                }
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
          }
        } @else {
          <div class="modal-action pt-4 flex-col gap-2">
            <button type="button" class="btn btn-primary w-full" (click)="onClose()">Done</button>
          </div>
        }
      </div>

      <form method="dialog" class="modal-backdrop">
        <button type="submit" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class SettleOrderModalComponent {
  private readonly settlementService = inject(CashierSettlementService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);
  readonly currencyService = inject(CurrencyService);

  readonly data = input<SettleOrderModalData | null>(null);

  readonly settled = output<void>();
  readonly cancelled = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoadingPaymentMethods = signal(false);
  readonly tenders = signal<TenderRow[]>([]);
  readonly successResult = signal<{
    amountSettled: number;
    remainingOwing: number;
    fullySettled: boolean;
  } | null>(null);

  readonly amountOwing = computed(() => this.data()?.amountOwing ?? 0);

  readonly totalTenderedCents = computed(() =>
    this.tenders().reduce((sum, t) => sum + this.parseCents(t.amountInput), 0),
  );

  readonly remainingCents = computed(() => this.amountOwing() - this.totalTenderedCents());

  readonly canSubmit = computed(() => {
    if (this.isProcessing()) return false;
    if (!this.cashierSessionService.hasActiveSession()) return false;
    const total = this.totalTenderedCents();
    if (total <= 0) return false;
    if (total > this.amountOwing()) return false;
    // Every non-empty tender must have a method and a positive amount.
    return this.tenders().every((t) => !!t.paymentMethodCode && this.parseCents(t.amountInput) > 0);
  });

  async show(): Promise<void> {
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    this.tenders.set([]);

    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        await firstValueFrom(this.cashierSessionService.getCurrentSession(channelId));
      }
    }

    await this.loadPaymentMethods();

    // Seed a single tender pre-filled to the full amount with the first method.
    const firstMethod = this.paymentMethods()[0]?.code ?? '';
    this.tenders.set([
      {
        paymentMethodCode: firstMethod,
        amountInput: this.toCurrencyInput(this.amountOwing()),
        referenceNumber: '',
      },
    ]);

    this.modalRef()?.nativeElement.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement.close();
  }

  private async loadPaymentMethods(): Promise<void> {
    this.isLoadingPaymentMethods.set(true);
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      this.paymentMethods.set(
        methods.filter((m) => m.enabled && m.customFields?.isActive !== false),
      );
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to load payment methods.');
      this.paymentMethods.set([]);
    } finally {
      this.isLoadingPaymentMethods.set(false);
    }
  }

  addTender(): void {
    const firstMethod = this.paymentMethods()[0]?.code ?? '';
    const remaining = this.remainingCents();
    this.tenders.update((rows) => [
      ...rows,
      {
        paymentMethodCode: firstMethod,
        amountInput: remaining > 0 ? this.toCurrencyInput(remaining) : '',
        referenceNumber: '',
      },
    ]);
  }

  removeTender(index: number): void {
    this.tenders.update((rows) => rows.filter((_, i) => i !== index));
  }

  updateTender(index: number, patch: Partial<TenderRow>): void {
    this.tenders.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Fill this row with whatever is still unallocated (plus its own current amount). */
  fillRemaining(index: number): void {
    const own = this.parseCents(this.tenders()[index]?.amountInput ?? '');
    const target = this.remainingCents() + own;
    this.updateTender(index, { amountInput: this.toCurrencyInput(Math.max(target, 0)) });
  }

  async onConfirm(): Promise<void> {
    const d = this.data();
    if (!d || !this.canSubmit()) return;

    const tenders: OrderTenderInput[] = this.tenders()
      .map((t) => ({
        paymentMethodCode: t.paymentMethodCode,
        amount: this.parseCents(t.amountInput),
        referenceNumber: t.referenceNumber.trim() || undefined,
      }))
      .filter((t) => t.amount > 0);

    this.isProcessing.set(true);
    this.error.set(null);
    try {
      const result = await this.settlementService.settleOrder(d.orderId, tenders);
      this.successResult.set({
        amountSettled: result.amountSettled,
        remainingOwing: result.remainingOwing,
        fullySettled: result.fullySettled,
      });
      setTimeout(() => {
        this.settled.emit();
        this.hide();
      }, 1500);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to collect payment. Please try again.');
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
    this.settled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    const modal = this.modalRef()?.nativeElement;
    if (modal && event.target === modal && !this.isProcessing()) {
      this.onCancel();
    }
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents, false);
  }

  /** Parse a typed currency string (units) into whole cents. */
  private parseCents(raw: string): number {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return 0;
    const parsed = parseFloat(trimmed.replace(/,/g, ''));
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }

  /** Render cents as a plain currency-unit string for an input field. */
  private toCurrencyInput(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}
