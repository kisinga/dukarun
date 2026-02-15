import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { CompanySearchSelectComponent } from '../../shared/components/company-search-select.component';
import { CurrencyService } from '../../../../core/services/currency.service';
import { validatePhoneNumber } from '../../../../core/utils/phone.utils';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  isCreditApproved: boolean;
  creditLimit: number;
  outstandingAmount: number;
  availableCredit: number;
}

/**
 * Customer search and creation component for credit sales
 */
@Component({
  selector: 'app-customer-selector',
  imports: [CommonModule, CompanySearchSelectComponent],
  template: `
    <div class="space-y-6">
      @if (!selectedCustomer() && !showForm()) {
        <!-- Customer company search -->
        <div class="space-y-4 anim-stagger">
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Search existing customer company</span>
            </label>
            <app-company-search-select
              [items]="searchResults()"
              [selectedId]="selectedCustomer()?.id ?? null"
              [searchTerm]="searchTerm()"
              [placeholder]="'Search customer company...'"
              [isLoading]="isSearching()"
              [getLabel]="getCustomerLabel"
              [getSubtitle]="getCustomerSubtitle"
              (searchTermChange)="onSearchInput($event)"
              (select)="customerSelect.emit($event)"
              (clear)="customerSelect.emit(null)"
            />
          </div>

          <div class="divider">OR</div>

          <!-- Create New Customer Button -->
          <button
            class="btn btn-outline btn-primary w-full interactive-press"
            (click)="showForm.set(true)"
          >
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
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            Create New Customer
          </button>
        </div>
      }

      <!-- New Customer Form -->
      @if (showForm()) {
        <div class="space-y-6 anim-stagger">
          <div class="alert alert-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-sm">Only basic details required for quick customer creation</span>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Name *</span>
            </label>
            <input
              type="text"
              class="input input-bordered text-base"
              placeholder="John Doe"
              [value]="newName()"
              (input)="newName.set($any($event.target).value)"
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Phone Number *</span>
            </label>
            <input
              type="tel"
              class="input input-bordered text-base"
              placeholder="0XXXXXXXXX"
              [value]="newPhone()"
              (input)="newPhone.set($any($event.target).value)"
            />
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Email (optional)</span>
            </label>
            <input
              type="email"
              class="input input-bordered text-base"
              placeholder="john@example.com"
              [value]="newEmail()"
              (input)="newEmail.set($any($event.target).value)"
            />
          </div>

          <div class="flex gap-3">
            <button
              class="btn btn-ghost flex-1 interactive-press"
              (click)="cancelForm()"
              [disabled]="isCreating()"
            >
              Cancel
            </button>
            <button
              class="btn btn-primary flex-1 interactive-press"
              (click)="createCustomer()"
              [disabled]="isCreating() || !canCreate()"
            >
              @if (isCreating()) {
                <span class="loading loading-spinner loading-sm"></span>
              }
              Create Customer
            </button>
          </div>
        </div>
      }

      <!-- Selected Customer Display -->
      @if (selectedCustomer()) {
        <div class="card bg-success/10 border-2 border-success anim-fade-in-up">
          <div class="card-body p-6">
            <div class="flex items-center gap-4">
              <div class="avatar placeholder">
                <div class="bg-success text-success-content w-14 rounded-full">
                  <span class="text-lg font-bold">{{
                    selectedCustomer()!.name.charAt(0).toUpperCase()
                  }}</span>
                </div>
              </div>
              <div class="flex-1">
                <div class="font-bold text-lg">{{ selectedCustomer()!.name }}</div>
                <div class="text-sm text-base-content/60">{{ selectedCustomer()!.phone }}</div>
                @if (selectedCustomer()!.email) {
                  <div class="text-sm text-base-content/60">{{ selectedCustomer()!.email }}</div>
                }
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div class="bg-base-100/60 rounded-lg p-2 text-center">
                    <div class="font-semibold text-base-content/70">Limit</div>
                    <div class="font-bold text-base-content">
                      {{ currencyService.format(selectedCustomer()!.creditLimit) }}
                    </div>
                  </div>
                  <div class="bg-base-100/60 rounded-lg p-2 text-center">
                    <div class="font-semibold text-base-content/70">Outstanding</div>
                    <div class="font-bold text-base-content">
                      {{ currencyService.format(selectedCustomer()!.outstandingAmount) }}
                    </div>
                  </div>
                  <div class="bg-base-100 rounded-lg p-2 text-center">
                    <div class="font-semibold text-base-content/70">Available</div>
                    <div class="font-bold text-success">
                      {{ currencyService.format(selectedCustomer()!.availableCredit) }}
                    </div>
                  </div>
                </div>
                @if (!selectedCustomer()!.isCreditApproved) {
                  <div class="alert alert-warning mt-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 flex-shrink-0"
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
                    <span class="text-sm">Customer pending credit approval</span>
                  </div>
                }
              </div>
              <button
                class="btn btn-ghost btn-sm btn-circle hover:bg-error/10 hover:text-error transition-colors"
                (click)="customerSelect.emit(null)"
                aria-label="Remove customer"
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
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerSelectorComponent {
  readonly currencyService = inject(CurrencyService);
  readonly selectedCustomer = input.required<Customer | null>();
  readonly searchResults = input.required<Customer[]>();
  readonly isSearching = input<boolean>(false);
  readonly isCreating = input<boolean>(false);

  readonly searchTermChange = output<string>();
  readonly customerSelect = output<Customer | null>();
  readonly customerCreate = output<{ name: string; phone: string; email?: string }>();

  readonly searchTerm = signal('');
  readonly showForm = signal(false);
  readonly newName = signal('');
  readonly newPhone = signal('');
  readonly newEmail = signal('');

  getCustomerLabel = (c: Customer): string => c.name;
  getCustomerSubtitle = (c: Customer): string => c.phone ?? '';

  readonly canCreate = () => {
    const name = this.newName().trim();
    const phone = this.newPhone().trim();
    return name.length > 0 && phone.length > 0 && validatePhoneNumber(phone);
  };

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.searchTermChange.emit(value);
  }

  createCustomer(): void {
    if (!this.canCreate()) return;

    this.customerCreate.emit({
      name: this.newName().trim(),
      phone: this.newPhone().trim(),
      email: this.newEmail().trim() || undefined,
    });
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.newName.set('');
    this.newPhone.set('');
    this.newEmail.set('');
  }
}
