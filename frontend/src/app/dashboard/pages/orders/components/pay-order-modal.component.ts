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
import { CustomerPaymentService } from '../../../../core/services/customer/customer-payment.service';
import { CustomerStateService } from '../../../../core/services/customer/customer-state.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrdersService } from '../../../../core/services/orders.service';
import {
  PaymentMethod,
  PaymentMethodService,
} from '../../../../core/services/payment-method.service';

export interface PayOrderModalData {
  orderId: string;
  orderCode: string;
  customerName: string;
  totalAmount: number;
}

/**
 * Pay Order Modal Component
 *
 * Mobile-optimized modal for paying a single order
 */
@Component({
  selector: 'app-pay-order-modal',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <h3 class="text-lg font-bold text-base-content">Pay Order</h3>
          <form method="dialog">
            <button
              class="btn btn-sm btn-circle btn-ghost"
              type="submit"
              [disabled]="isProcessing()"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </form>
        </div>

        <!-- Order Info -->
        <div class="mb-4 p-3 sm:p-4 bg-base-200 rounded-lg">
          <div class="text-sm sm:text-base font-semibold text-base-content mb-1">
            {{ orderData()?.orderCode }}
          </div>
          <div class="text-xs text-base-content/70">{{ orderData()?.customerName }}</div>
        </div>

        <!-- Success Message -->
        @if (successResult()) {
          <div class="alert alert-success mb-4">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <div class="flex-1">
              <div class="font-semibold">Payment recorded successfully!</div>
              <div class="text-xs mt-1">
                Total allocated: {{ formatCurrency(successResult()!.totalAllocated) }}
              </div>
            </div>
          </div>
        }

        <!-- Error Message -->
        @if (error()) {
          <div class="alert alert-error mb-4">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <span class="text-sm">{{ error() }}</span>
          </div>
        }

        <!-- Payment Form -->
        @if (!successResult()) {
          <form (ngSubmit)="onConfirmPayment()" class="space-y-4">
            <!-- Payment Amount Display -->
            <div class="card bg-base-200">
              <div class="card-body p-4">
                <div class="flex justify-between items-center">
                  <span class="text-sm font-medium text-base-content">Amount to Pay</span>
                  <span class="text-xl font-bold text-primary">
                    {{ formatCurrency(orderData()?.totalAmount || 0) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Payment Method Selection -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Payment Method</span>
                <span class="label-text-alt text-error">Required</span>
              </label>

              @if (isLoadingPaymentMethods()) {
                <div class="flex items-center justify-center py-8">
                  <span class="loading loading-spinner loading-md"></span>
                  <span class="ml-2 text-sm text-base-content/60">Loading payment methods...</span>
                </div>
              } @else if (paymentMethodsError()) {
                <div class="alert alert-error">
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="text-sm">{{ paymentMethodsError() }}</span>
                </div>
              } @else if (paymentMethods().length === 0) {
                <div class="alert alert-warning">
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="text-sm">No payment methods available</span>
                </div>
              } @else {
                <!-- Payment Method Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  @for (method of paymentMethods(); track method.id; let i = $index) {
                    <button
                      type="button"
                      class="card hover:bg-base-200 border-2 transition-all duration-200 p-4 hover:scale-105 active:scale-95"
                      [class.border-primary]="selectedPaymentMethod() === method.code"
                      [class.bg-primary/10]="selectedPaymentMethod() === method.code"
                      [class.border-base-300]="selectedPaymentMethod() !== method.code"
                      [disabled]="isProcessing()"
                      (click)="selectedPaymentMethod.set(method.code)"
                    >
                      <div class="flex flex-col items-center gap-2">
                        <div
                          class="w-10 h-10 rounded-full flex items-center justify-center"
                          [class.bg-primary/20]="selectedPaymentMethod() === method.code"
                          [class.bg-base-200]="selectedPaymentMethod() !== method.code"
                        >
                          @if (method.customFields?.imageAsset?.preview) {
                            <img
                              [src]="method.customFields!.imageAsset!.preview"
                              [alt]="method.name"
                              class="w-8 h-8 object-contain"
                            />
                          } @else {
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-6 w-6"
                              [class.text-primary]="selectedPaymentMethod() === method.code"
                              [class.text-base-content/60]="selectedPaymentMethod() !== method.code"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                              />
                            </svg>
                          }
                        </div>
                        <span class="font-semibold text-xs text-center">{{ method.name }}</span>
                      </div>
                    </button>
                  }
                </div>
              }

              @if (
                error() &&
                !selectedPaymentMethod() &&
                !isLoadingPaymentMethods() &&
                paymentMethods().length > 0
              ) {
                <label class="label">
                  <span class="label-text-alt text-error">Please select a payment method</span>
                </label>
              }
            </div>

            <!-- Reference Code Input -->
            <div class="form-control">
              <label class="label" for="referenceCode">
                <span class="label-text font-semibold">Payment Reference Code</span>
                <span class="label-text-alt text-error">Required</span>
              </label>
              <input
                id="referenceCode"
                type="text"
                placeholder="Enter payment reference/transaction code"
                [value]="referenceCode()"
                (input)="referenceCode.set($any($event.target).value)"
                name="referenceCode"
                class="input input-bordered w-full"
                [class.input-error]="
                  error() && (!referenceCode() || referenceCode().trim().length === 0)
                "
                [disabled]="isProcessing()"
                required
                autofocus
              />
              <label class="label">
                <span class="label-text-alt text-base-content/60">
                  Enter the transaction or reference code for this payment
                </span>
              </label>
            </div>

            <!-- Loading State -->
            @if (isProcessing()) {
              <div class="flex items-center justify-center py-4">
                <span class="loading loading-spinner loading-lg"></span>
                <span class="ml-2 text-sm sm:text-base text-base-content/60"
                  >Processing payment...</span
                >
              </div>
            }

            <!-- Actions -->
            <div class="modal-action pt-4 flex-col gap-2">
              <button
                type="submit"
                class="btn btn-primary w-full"
                [class.loading]="isProcessing()"
                [disabled]="
                  isProcessing() ||
                  !selectedPaymentMethod() ||
                  !referenceCode() ||
                  referenceCode().trim().length === 0
                "
              >
                @if (!isProcessing()) {
                  Confirm Payment
                } @else {
                  Processing...
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
          </form>
        } @else {
          <!-- Success State Actions -->
          <div class="modal-action pt-4 flex-col gap-2">
            <button type="button" class="btn btn-primary w-full" (click)="onClose()">Close</button>
          </div>
        }
      </div>

      <!-- Backdrop -->
      <form method="dialog" class="modal-backdrop">
        <button type="submit" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class PayOrderModalComponent {
  private readonly paymentService = inject(CustomerPaymentService);
  private readonly stateService = inject(CustomerStateService);
  private readonly currencyService = inject(CurrencyService);
  private readonly ordersService = inject(OrdersService);
  private readonly paymentMethodService = inject(PaymentMethodService);

  // Inputs
  readonly orderData = input<PayOrderModalData | null>(null);

  // Outputs
  readonly paymentRecorded = output<void>();
  readonly cancelled = output<void>();

  // Modal reference
  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  // State
  readonly isProcessing = signal(false);
  readonly error = signal<string | null>(null);
  readonly referenceCode = signal<string>('');
  readonly selectedPaymentMethod = signal<string | null>(null);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoadingPaymentMethods = signal(false);
  readonly paymentMethodsError = signal<string | null>(null);
  readonly successResult = signal<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null>(null);

  /**
   * Show the modal
   */
  async show(): Promise<void> {
    // Reset state
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    this.referenceCode.set('');
    this.selectedPaymentMethod.set(null);
    this.paymentMethodsError.set(null);

    // Fetch payment methods
    await this.loadPaymentMethods();

    // Show modal
    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  /**
   * Load payment methods
   */
  async loadPaymentMethods(): Promise<void> {
    this.isLoadingPaymentMethods.set(true);
    this.paymentMethodsError.set(null);

    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      // Filter to only enabled/active methods
      const activeMethods = methods.filter((m) => m.enabled && m.customFields?.isActive !== false);
      this.paymentMethods.set(activeMethods);
    } catch (error: any) {
      console.error('Failed to load payment methods:', error);
      this.paymentMethodsError.set(
        error.message || 'Failed to load payment methods. Please try again.',
      );
      this.paymentMethods.set([]);
    } finally {
      this.isLoadingPaymentMethods.set(false);
    }
  }

  /**
   * Get selected payment method name
   */
  getSelectedPaymentMethodName(): string {
    const code = this.selectedPaymentMethod();
    if (!code) return '';
    const method = this.paymentMethods().find((m) => m.code === code);
    return method?.name || code;
  }

  /**
   * Hide the modal
   */
  hide(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }

  /**
   * Handle payment confirmation
   */
  async onConfirmPayment(): Promise<void> {
    const data = this.orderData();
    if (!data) return;

    // Validate payment method
    const paymentMethodCode = this.selectedPaymentMethod();
    if (!paymentMethodCode) {
      this.error.set('Please select a payment method');
      return;
    }

    // Validate reference code
    const refCode = this.referenceCode().trim();
    if (!refCode || refCode.length === 0) {
      this.error.set('Please enter a payment reference code');
      return;
    }

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const result = await this.paymentService.paySingleOrder(
        data.orderId,
        data.totalAmount, // Pass cents
        paymentMethodCode,
        refCode,
      );

      if (result) {
        this.successResult.set(result);
        // Auto-close after 2 seconds and refresh orders
        setTimeout(async () => {
          await this.ordersService.fetchOrders({
            take: 100,
            skip: 0,
            sort: { createdAt: 'DESC' as any },
          });
          this.paymentRecorded.emit();
          this.hide();
        }, 2000);
      } else {
        const serviceError = this.stateService.error();
        // Improve error message for common cases
        let errorMessage = serviceError || 'Failed to record payment. Please try again.';

        // Check for specific error patterns and provide better messages
        if (serviceError) {
          const lowerError = serviceError.toLowerCase();
          if (
            lowerError.includes('no unpaid orders') ||
            lowerError.includes('unpaid orders found')
          ) {
            errorMessage =
              'This order cannot be paid using this method. It may already be fully paid, is not a credit order, or does not have outstanding balance. Please check the order details.';
          } else if (lowerError.includes('pending') || lowerError.includes('unpaid')) {
            errorMessage =
              'This order does not have any outstanding payment. It may already be paid or is not a credit order.';
          } else if (lowerError.includes('customer')) {
            errorMessage =
              'Unable to process payment. Please ensure this is a credit order for a valid customer.';
          } else if (lowerError.includes('not found')) {
            errorMessage = 'Order not found. Please refresh the page and try again.';
          }
        }

        this.error.set(errorMessage);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      let errorMessage = error.message || 'An unexpected error occurred. Please try again.';

      // Improve error message for common cases
      if (error.message) {
        const lowerError = error.message.toLowerCase();
        if (lowerError.includes('no unpaid orders') || lowerError.includes('unpaid orders found')) {
          errorMessage =
            'This order cannot be paid using this method. It may already be fully paid, is not a credit order, or does not have outstanding balance. Please check the order details.';
        } else if (lowerError.includes('pending') || lowerError.includes('unpaid')) {
          errorMessage =
            'This order does not have any outstanding payment. It may already be paid or is not a credit order.';
        } else if (lowerError.includes('not found')) {
          errorMessage = 'Order not found. Please refresh the page and try again.';
        }
      }

      this.error.set(errorMessage);
    } finally {
      this.isProcessing.set(false);
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
   * Handle close after success
   */
  onClose(): void {
    this.hide();
    this.paymentRecorded.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    const modal = this.modalRef()?.nativeElement;
    if (modal && event.target === modal && !this.isProcessing()) {
      this.onCancel();
    }
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }
}
