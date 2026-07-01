import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
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
  imports: [CommonModule, NgIcon, CustomerSelectorComponent, CheckoutSummaryComponent],
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
          <ng-icon name="heroDocumentText" size="1.5rem" />
          <span class="font-bold text-base sm:text-lg">Save as Proforma</span>
        </button>

        <!-- Credit Button (Large, Isolated, Above Grid) -->
        <button
          class="btn btn-warning btn-lg w-full flex items-center justify-center gap-3 interactive-press min-h-[52px]"
          (click)="selectCredit.emit()"
        >
          <ng-icon name="heroCreditCard" size="1.5rem" />
          <span class="font-bold text-base sm:text-lg">Credit Sale</span>
        </button>

        <!-- Cash Payment Methods Grid -->
        @if (paymentMethodsError()) {
          <div class="alert alert-error anim-fade-in-down">
            <ng-icon name="heroExclamationCircle" size="1rem" class="flex-shrink-0" />
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
                      <ng-icon
                        name="heroBanknotes"
                        size="1.25rem"
                        class="transition-colors duration-300"
                        [class.text-success]="selectedPaymentMethod()?.code === method.code"
                        [class.text-base-content/60]="selectedPaymentMethod()?.code !== method.code"
                      />
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
                    <ng-icon name="heroCheckCircle" size="1rem" class="text-success" />
                    <span class="text-xs sm:text-sm text-success"
                      >Linked to {{ selectedCustomerForCash()!.name }}</span
                    >
                  </div>
                  <button
                    class="btn btn-ghost btn-xs btn-circle"
                    (click)="customerSelectForCash.emit(null)"
                    aria-label="Remove customer"
                  >
                    <ng-icon name="heroXMark" size="0.75rem" />
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
                    <ng-icon name="heroCheck" size="1.25rem" />
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
                      <ng-icon name="heroPrinter" size="1.25rem" />
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
