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
                Total allocated: {{ formatCurrency(successResult()!.totalAllocated * 100) }}
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
                  isProcessing() || !referenceCode() || referenceCode().trim().length === 0
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
  readonly successResult = signal<{
    ordersPaid: Array<{ orderId: string; orderCode: string; amountPaid: number }>;
    remainingBalance: number;
    totalAllocated: number;
  } | null>(null);

  /**
   * Show the modal
   */
  show(): void {
    // Reset state
    this.error.set(null);
    this.successResult.set(null);
    this.isProcessing.set(false);
    this.referenceCode.set('');

    // Show modal
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
   * Handle payment confirmation
   */
  async onConfirmPayment(): Promise<void> {
    const data = this.orderData();
    if (!data) return;

    // Validate reference code
    const refCode = this.referenceCode().trim();
    if (!refCode || refCode.length === 0) {
      this.error.set('Please enter a payment reference code');
      return;
    }

    this.isProcessing.set(true);
    this.error.set(null);

    try {
      // Convert amount from cents to shillings for backend
      const paymentAmount = data.totalAmount / 100;

      const result = await this.paymentService.paySingleOrder(data.orderId, paymentAmount);

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
