import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  PaymentMethod,
  PaymentMethodService,
} from '../../../../core/services/payment-method.service';
import { Customer } from './customer-selector.component';
import { CheckoutCashComponent } from './checkout/checkout-cash.component';
import { CheckoutCashierComponent } from './checkout/checkout-cashier.component';
import { CheckoutCreditComponent } from './checkout/checkout-credit.component';
import { CheckoutSuccessComponent } from './checkout/checkout-success.component';

type CheckoutType = 'credit' | 'cashier' | 'cash' | null;
type PaymentMethodCode = string;

/**
 * Unified checkout modal handling all payment flows
 */
@Component({
  selector: 'app-checkout-modal',
  imports: [
    CommonModule,
    CheckoutSuccessComponent,
    CheckoutCashierComponent,
    CheckoutCreditComponent,
    CheckoutCashComponent,
  ],
  template: `
    @if (isOpen()) {
      <div class="modal modal-open modal-bottom sm:modal-middle modal-backdrop-anim">
        <!-- Success Animation (Full-Screen Overlay) -->
        <app-checkout-success
          [show]="showSuccessAnimation()"
          [amount]="confirmedAmount()"
          [paymentMethod]="confirmedPaymentMethod()"
        />

        @if (!showSuccessAnimation()) {
          <div
            class="modal-box max-w-2xl p-0 max-h-[90vh] sm:max-h-[95vh] flex flex-col modal-box-anim relative"
          >
            <!-- Modal Header -->
            <div
              class="bg-base-100 p-3 sm:p-4 border-b border-base-300 flex items-center justify-between flex-shrink-0"
            >
              <div class="flex items-center gap-2">
                <div class="indicator">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 sm:h-4 sm:w-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="indicator-item badge badge-primary badge-xs sm:badge-sm">{{
                    itemCount()
                  }}</span>
                </div>
                <h3 class="font-bold text-sm sm:text-base">Checkout</h3>
              </div>
              <button
                class="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
                (click)="closeModal.emit()"
                aria-label="Close checkout"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-3 sm:p-4 relative">
              <!-- Error Alert -->
              @if (error()) {
                <div role="alert" class="alert alert-error mb-3 anim-fade-in-down">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="text-sm">{{ error() }}</span>
                </div>
              }

              <!-- Cashier Flow -->
              @if (checkoutType() === 'cashier') {
                <app-checkout-cashier
                  [itemCount]="itemCount()"
                  [total]="total()"
                  [isProcessing]="isProcessing()"
                  (complete)="onCompleteCashier()"
                />
              }

              <!-- Credit Sale Flow -->
              @if (checkoutType() === 'credit') {
                <app-checkout-credit
                  [itemCount]="itemCount()"
                  [total]="total()"
                  [isProcessing]="isProcessing()"
                  [selectedCustomer]="selectedCustomer()"
                  [customerSearchResults]="customerSearchResults()"
                  [isSearchingCustomers]="isSearchingCustomers()"
                  (customerSearch)="customerSearch.emit($event)"
                  (customerSelect)="customerSelect.emit($event)"
                  (customerCreate)="customerCreate.emit($event)"
                  (complete)="onCompleteCredit()"
                  (completeAndPrint)="onCompleteCreditAndPrint()"
                  [enablePrinter]="enablePrinter()"
                />
              }

              <!-- Payment Selection (Default) -->
              @if (!checkoutType()) {
                <app-checkout-cash
                  [itemCount]="itemCount()"
                  [total]="total()"
                  [isProcessing]="isProcessing()"
                  [paymentMethods]="paymentMethods()"
                  [paymentMethodsError]="paymentMethodsError()"
                  [selectedPaymentMethod]="selectedPaymentMethod()"
                  [selectedCustomerForCash]="selectedCustomerForCash()"
                  [customerSearchResultsForCash]="customerSearchResultsForCash()"
                  [isSearchingCustomersForCash]="isSearchingCustomersForCash()"
                  (selectCredit)="selectCredit.emit()"
                  (paymentMethodSelect)="onPaymentMethodSelect($event)"
                  (customerSearchForCash)="customerSearchForCash.emit($event)"
                  (customerSelectForCash)="customerSelectForCash.emit($event)"
                  (customerCreateForCash)="customerCreateForCash.emit($event)"
                  (complete)="onCompleteCash()"
                  (completeAndPrint)="onCompleteCashAndPrint()"
                  [enablePrinter]="enablePrinter()"
                />
              }
            </div>
          </div>
        }
        <div class="modal-backdrop" (click)="closeModal.emit()"></div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutModalComponent implements OnInit, OnDestroy {
  readonly currencyService = inject(CurrencyService);
  readonly paymentMethodService = inject(PaymentMethodService);

  readonly isOpen = input.required<boolean>();
  readonly checkoutType = input.required<CheckoutType>();
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly error = input<string | null>(null);
  readonly isProcessing = input<boolean>(false);
  readonly cashierFlowEnabled = input<boolean>(false);
  readonly triggerSuccess = input<{ amount: number; method: string } | null>(null);

  readonly enablePrinter = input<boolean>(true);

  // Credit sale inputs
  readonly selectedCustomer = input<Customer | null>(null);
  readonly customerSearchResults = input<Customer[]>([]);
  readonly isSearchingCustomers = input<boolean>(false);

  // Cash sale inputs
  readonly selectedPaymentMethod = input<PaymentMethodCode | null>(null);
  readonly selectedCustomerForCash = input<Customer | null>(null);
  readonly customerSearchResultsForCash = input<Customer[]>([]);
  readonly isSearchingCustomersForCash = input<boolean>(false);

  // Outputs
  readonly completeCashier = output<void>();
  readonly completeCredit = output<void>();
  readonly completeCreditAndPrint = output<void>();
  readonly completeCash = output<void>();
  readonly completeCashAndPrint = output<void>();
  readonly customerSearch = output<string>();
  readonly customerSelect = output<Customer | null>();
  readonly customerSearchForCash = output<string>();
  readonly customerSelectForCash = output<Customer | null>();
  readonly customerCreate = output<{ name: string; phone: string; email?: string }>();
  readonly customerCreateForCash = output<{ name: string; phone: string; email?: string }>();
  readonly paymentMethodSelect = output<PaymentMethodCode>();
  readonly closeModal = output<void>();

  // Payment selection outputs
  readonly selectCredit = output<void>();
  readonly selectCash = output<void>();
  readonly selectCashier = output<void>();

  // Dynamic payment methods
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly paymentMethodsError = signal<string | null>(null);
  readonly showSuccessAnimation = signal<boolean>(false);
  readonly confirmedAmount = signal<number | null>(null);
  readonly confirmedPaymentMethod = signal<string | null>(null);
  private successAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Reset success animation state when modal closes
    effect(() => {
      if (!this.isOpen()) {
        this.resetSuccessState();
      }
    });

    // Trigger success animation when parent requests it
    effect(() => {
      const successData = this.triggerSuccess();
      if (successData) {
        this.triggerSuccessAnimation(successData.amount, successData.method);
      }
    });
  }

  async ngOnInit() {
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      this.paymentMethods.set(methods);
      this.paymentMethodsError.set(null);
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      this.paymentMethodsError.set(
        error instanceof Error ? error.message : 'Failed to load payment methods',
      );
      this.paymentMethods.set([]);
    }
  }

  ngOnDestroy(): void {
    this.resetSuccessState();
    if (this.successAnimationTimer) {
      clearTimeout(this.successAnimationTimer);
      this.successAnimationTimer = null;
    }
  }

  private resetSuccessState(): void {
    if (this.successAnimationTimer) {
      clearTimeout(this.successAnimationTimer);
      this.successAnimationTimer = null;
    }
    this.showSuccessAnimation.set(false);
    this.confirmedAmount.set(null);
    this.confirmedPaymentMethod.set(null);
  }

  getSelectedPaymentMethodName(): string {
    const selectedCode = this.selectedPaymentMethod();
    if (!selectedCode) return '';

    const method = this.paymentMethods().find((m) => m.code === selectedCode);
    return method?.name || selectedCode;
  }

  onPaymentMethodSelect(code: string): void {
    this.paymentMethodSelect.emit(code as PaymentMethodCode);
  }

  onCompleteCash(): void {
    this.completeCash.emit();
  }

  onCompleteCashAndPrint(): void {
    this.completeCashAndPrint.emit();
  }

  onCompleteCredit(): void {
    this.completeCredit.emit();
  }

  onCompleteCreditAndPrint(): void {
    this.completeCreditAndPrint.emit();
  }

  onCompleteCashier(): void {
    this.completeCashier.emit();
  }

  private triggerSuccessAnimation(amount: number, method: string): void {
    // Clear any existing timer
    if (this.successAnimationTimer) {
      clearTimeout(this.successAnimationTimer);
      this.successAnimationTimer = null;
    }

    this.confirmedAmount.set(amount);
    this.confirmedPaymentMethod.set(method);
    this.showSuccessAnimation.set(true);
    // Note: Animation will be dismissed when modal closes (via resetSuccessState)
  }
}
