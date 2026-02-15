import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PaymentMethod } from '../../../../../core/services/payment-method.service';
import { Customer, CustomerSelectorComponent } from '../customer-selector.component';
import { CheckoutSummaryComponent } from './checkout-summary.component';

export interface SelectedPaymentMethod {
  code: string;
  name: string;
}

@Component({
  selector: 'app-checkout-cash',
  standalone: true,
  imports: [CommonModule, CustomerSelectorComponent, CheckoutSummaryComponent],
  template: `
    <div class="space-y-3 anim-stagger">
      <!-- Step 1: Order Summary (Read-Only) -->
      @if (!selectedPaymentMethod()) {
        <app-checkout-summary
          [itemCount]="itemCount()"
          [total]="total()"
          [totalColor]="'primary'"
        />
      }

      <!-- Step 2: Payment Method Selection -->
      <div class="space-y-3">
        <!-- Save as Proforma Button -->
        <button
          class="btn btn-ghost btn-lg w-full flex items-center justify-center gap-3 interactive-press min-h-[52px] border-2 border-dashed border-base-300"
          (click)="saveAsProforma.emit()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span class="font-bold text-base sm:text-lg">Save as Proforma</span>
        </button>

        <!-- Credit Button (Large, Isolated, Above Grid) -->
        <button
          class="btn btn-warning btn-lg w-full flex items-center justify-center gap-3 interactive-press min-h-[52px]"
          (click)="selectCredit.emit()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
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
          <span class="font-bold text-base sm:text-lg">Credit Sale</span>
        </button>

        <!-- Cash Payment Methods Grid -->
        @if (paymentMethodsError()) {
          <div class="alert alert-error anim-fade-in-down">
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
            <div class="text-sm">
              <p class="font-semibold">Payment Methods Not Available</p>
              <p class="mt-1">{{ paymentMethodsError() }}</p>
            </div>
          </div>
        } @else {
          <div class="grid grid-cols-2 gap-2 sm:gap-3 anim-stagger">
            @for (method of paymentMethods(); track method.id; let i = $index) {
              <button
                class="card border-2 transition-all duration-300 p-3 sm:p-4 interactive-ripple interactive-press min-h-[44px] touch-manipulation"
                [class.border-success]="selectedPaymentMethod()?.code === method.code"
                [class.bg-success/10]="selectedPaymentMethod()?.code === method.code"
                [class.border-base-300]="selectedPaymentMethod()?.code !== method.code"
                [class.ring-2]="selectedPaymentMethod()?.code === method.code"
                [class.ring-success]="selectedPaymentMethod()?.code === method.code"
                [class.ring-opacity-50]="selectedPaymentMethod()?.code === method.code"
                (click)="paymentMethodSelect.emit({ code: method.code, name: method.name })"
              >
                <div class="flex flex-col items-center gap-2">
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                    [class.bg-success/20]="selectedPaymentMethod()?.code === method.code"
                    [class.bg-base-200]="selectedPaymentMethod()?.code !== method.code"
                    [class.scale-110]="selectedPaymentMethod()?.code === method.code"
                  >
                    @if (method.customFields?.imageAsset?.preview) {
                      <img
                        [src]="method.customFields?.imageAsset?.preview"
                        [alt]="method.name"
                        class="w-6 h-6 object-contain"
                      />
                    } @else {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 transition-colors duration-300"
                        [class.text-success]="selectedPaymentMethod()?.code === method.code"
                        [class.text-base-content/60]="selectedPaymentMethod()?.code !== method.code"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    }
                  </div>
                  <span class="font-semibold text-xs sm:text-sm text-center leading-tight">{{
                    method.name
                  }}</span>
                </div>
              </button>
            }
          </div>

          <!-- Confirmation after cash method selection -->
          @if (selectedPaymentMethod()) {
            <div class="space-y-3 anim-fade-in-up">
              <!-- Optional Customer Selection (Collapsible/Minimal) -->
              @if (!selectedCustomerForCash()) {
                <details class="collapse collapse-arrow bg-base-200 rounded-lg">
                  <summary class="collapse-title text-xs sm:text-sm font-medium py-2 min-h-0">
                    Link Customer (Optional)
                  </summary>
                  <div class="collapse-content p-0 pt-2">
                    <app-customer-selector
                      [selectedCustomer]="selectedCustomerForCash()"
                      [searchResults]="customerSearchResultsForCash()"
                      [isSearching]="isSearchingCustomersForCash()"
                      [isCreating]="isProcessing()"
                      (searchTermChange)="customerSearchForCash.emit($event)"
                      (customerSelect)="customerSelectForCash.emit($event)"
                      (customerCreate)="customerCreateForCash.emit($event)"
                    />
                  </div>
                </details>
              } @else {
                <div class="flex items-center justify-between bg-success/10 rounded-lg p-2 px-3">
                  <div class="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 text-success"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span class="text-xs sm:text-sm text-success"
                      >Linked to {{ selectedCustomerForCash()!.name }}</span
                    >
                  </div>
                  <button
                    class="btn btn-ghost btn-xs btn-circle"
                    (click)="customerSelectForCash.emit(null)"
                    aria-label="Remove customer"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3 w-3"
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
              }

              <app-checkout-summary
                [itemCount]="itemCount()"
                [total]="total()"
                [totalColor]="'success'"
                [paymentMethodName]="getSelectedPaymentMethodName()"
              />

              <div class="flex flex-col sm:flex-row gap-3">
                <button
                  class="btn btn-success btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
                  (click)="complete.emit()"
                  [disabled]="isProcessing()"
                >
                  @if (isProcessing()) {
                    <span class="loading loading-spinner"></span>
                  } @else {
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  }
                  Complete
                </button>

                @if (enablePrinter()) {
                  <button
                    class="btn btn-outline btn-success btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
                    (click)="completeAndPrint.emit()"
                    [disabled]="isProcessing()"
                  >
                    @if (isProcessing()) {
                      <span class="loading loading-spinner"></span>
                    } @else {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                        />
                      </svg>
                    }
                    Complete & Print
                  </button>
                }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutCashComponent {
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly isProcessing = input<boolean>(false);
  readonly paymentMethods = input<PaymentMethod[]>([]);
  readonly paymentMethodsError = input<string | null>(null);
  readonly selectedPaymentMethod = input<SelectedPaymentMethod | null>(null);
  readonly selectedCustomerForCash = input<Customer | null>(null);
  readonly customerSearchResultsForCash = input<Customer[]>([]);
  readonly isSearchingCustomersForCash = input<boolean>(false);

  readonly enablePrinter = input<boolean>(true);

  readonly selectCredit = output<void>();
  readonly saveAsProforma = output<void>();
  readonly paymentMethodSelect = output<SelectedPaymentMethod>();
  readonly customerSearchForCash = output<string>();
  readonly customerSelectForCash = output<Customer | null>();
  readonly customerCreateForCash = output<{ name: string; phone: string; email?: string }>();
  readonly complete = output<void>();
  readonly completeAndPrint = output<void>();

  getSelectedPaymentMethodName(): string {
    return this.selectedPaymentMethod()?.name ?? '';
  }
}
