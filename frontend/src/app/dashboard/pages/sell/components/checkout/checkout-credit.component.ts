import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Customer, CustomerSelectorComponent } from '../customer-selector.component';
import { CheckoutSummaryComponent } from './checkout-summary.component';

@Component({
  selector: 'app-checkout-credit',
  standalone: true,
  imports: [CommonModule, CustomerSelectorComponent, CheckoutSummaryComponent],
  template: `
    <div class="space-y-4 animate-in slide-in-from-left-2 duration-300">
      <div class="text-center">
        <div
          class="inline-flex items-center justify-center w-8 h-8 bg-warning/10 rounded-full mb-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <h4 class="font-bold text-lg sm:text-xl mb-1">Credit Sale</h4>
      </div>

      <div class="animate-in slide-in-from-top-2 duration-300 delay-100">
        <app-customer-selector
          [selectedCustomer]="selectedCustomer()"
          [searchResults]="customerSearchResults()"
          [isSearching]="isSearchingCustomers()"
          [isCreating]="isProcessing()"
          (searchTermChange)="customerSearch.emit($event)"
          (customerSelect)="customerSelect.emit($event)"
          (customerCreate)="customerCreate.emit($event)"
        />
      </div>

      <!-- Complete Credit Sale -->
      @if (selectedCustomer()) {
        <div class="space-y-4 animate-in slide-in-from-bottom-2 duration-300 delay-200">
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Limit</div>
              <div class="text-base sm:text-lg font-bold text-base-content">
                {{ selectedCustomer()!.creditLimit | number: '1.0-0' }}
              </div>
            </div>
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Outstanding</div>
              <div class="text-base sm:text-lg font-bold text-base-content">
                {{ selectedCustomer()!.outstandingAmount | number: '1.0-0' }}
              </div>
            </div>
            <div class="bg-base-300 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Available</div>
              <div class="text-base sm:text-lg font-bold text-success">
                {{ selectedCustomer()!.availableCredit | number: '1.0-0' }}
              </div>
            </div>
          </div>

          @if (!selectedCustomer()!.isCreditApproved) {
            <div class="alert alert-warning">
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
              <span class="text-sm">Pending credit approval</span>
            </div>
          }

          @if (selectedCustomer()!.availableCredit < total()) {
            <div class="alert alert-error">
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
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span class="text-sm"
                >Insufficient credit. Available
                {{ selectedCustomer()!.availableCredit | number: '1.0-0' }}.</span
              >
            </div>
          }

          <app-checkout-summary
            [itemCount]="itemCount()"
            [total]="total()"
            [totalLabel]="'Total Due'"
            [totalColor]="'warning'"
          />

          <div class="flex flex-col sm:flex-row gap-3">
            <button
              class="btn btn-warning btn-md sm:btn-lg flex-1 hover:scale-105 active:scale-95 transition-transform min-h-[44px]"
              (click)="complete.emit()"
              [disabled]="isProcessing() || !canCompleteCredit()"
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
                class="btn btn-outline btn-warning btn-md sm:btn-lg flex-1 hover:scale-105 active:scale-95 transition-transform min-h-[44px]"
                (click)="completeAndPrint.emit()"
                [disabled]="isProcessing() || !canCompleteCredit()"
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
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutCreditComponent {
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly isProcessing = input<boolean>(false);
  readonly selectedCustomer = input<Customer | null>(null);
  readonly customerSearchResults = input<Customer[]>([]);
  readonly isSearchingCustomers = input<boolean>(false);

  readonly enablePrinter = input<boolean>(true);

  readonly customerSearch = output<string>();
  readonly customerSelect = output<Customer | null>();
  readonly customerCreate = output<{ name: string; phone: string; email?: string }>();
  readonly complete = output<void>();
  readonly completeAndPrint = output<void>();

  readonly canCompleteCredit = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer) {
      return false;
    }
    if (!customer.isCreditApproved) {
      return false;
    }
    return customer.availableCredit >= this.total();
  });
}
