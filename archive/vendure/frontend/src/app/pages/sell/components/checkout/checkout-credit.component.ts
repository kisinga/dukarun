import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../../shared/services/currency.service';
import { Customer, CustomerSelectorComponent } from '../customer-selector.component';
import { CheckoutSummaryComponent } from './checkout-summary.component';

@Component({
  selector: 'app-checkout-credit',
  standalone: true,
  imports: [CommonModule, NgIcon, CustomerSelectorComponent, CheckoutSummaryComponent],
  template: `
    <div class="space-y-4 anim-stagger">
      <div class="text-center">
        <div
          class="inline-flex items-center justify-center w-8 h-8 bg-warning/10 rounded-full mb-3"
        >
          <ng-icon name="heroUser" size="1.25rem" class="text-warning" />
        </div>
        <h4 class="font-bold text-lg sm:text-xl mb-1">Credit Sale</h4>
      </div>

      <div>
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
        <div class="space-y-4 anim-fade-in-up">
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Limit</div>
              <div class="text-base sm:text-lg font-bold text-base-content">
                {{ currencyService.format(selectedCustomer()!.creditLimit) }}
              </div>
            </div>
            <div class="bg-base-200 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Outstanding</div>
              <div class="text-base sm:text-lg font-bold text-base-content">
                {{ currencyService.format(selectedCustomer()!.outstandingAmount) }}
              </div>
            </div>
            <div class="bg-base-300 rounded-xl p-3 text-center">
              <div class="text-xs text-base-content/60 uppercase tracking-wide">Available</div>
              <div class="text-base sm:text-lg font-bold text-success">
                {{ currencyService.format(selectedCustomer()!.availableCredit) }}
              </div>
            </div>
          </div>

          @if (!selectedCustomer()!.isCreditApproved) {
            <div class="alert alert-warning">
              <ng-icon name="heroExclamationCircle" size="1rem" class="flex-shrink-0" />
              <span class="text-sm">Pending credit approval</span>
            </div>
          }

          @if (selectedCustomer()!.availableCredit < total()) {
            <div class="alert alert-error">
              <ng-icon name="heroXCircle" size="1rem" class="flex-shrink-0" />
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
              class="btn btn-warning btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
              (click)="complete.emit()"
              [disabled]="isProcessing() || !canCompleteCredit()"
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
                class="btn btn-outline btn-warning btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
                (click)="completeAndPrint.emit()"
                [disabled]="isProcessing() || !canCompleteCredit()"
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
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutCreditComponent {
  readonly currencyService = inject(CurrencyService);
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
