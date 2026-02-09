import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { CreditCustomerSummary, CustomerService } from '../../../core/services/customer.service';
import { ToastService } from '../../../core/services/toast.service';
import { PageHeaderComponent } from '../shared/components/page-header.component';
import { PersonEditFormComponent } from '../shared/components/person-edit-form.component';

/**
 * Customer Edit Component
 *
 * Mobile-optimized customer editing form.
 * Uses shared PersonEditFormComponent for consistent UX.
 *
 * ARCHITECTURE: Reuses shared form component for maintainability.
 */
@Component({
  selector: 'app-customer-edit',
  imports: [CommonModule, PageHeaderComponent, PersonEditFormComponent],
  template: `
    <div class="min-h-screen bg-base-100">
      <app-page-header title="Edit Customer" (backClick)="goBack()" />

      <div class="p-4">
        @if (error()) {
          <div class="alert alert-warning mb-4" [class.alert-error]="!isWalkInCustomer()">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <div class="flex-1">
              <div class="font-semibold">
                {{ isWalkInCustomer() ? 'Walk-in Customer' : 'Error' }}
              </div>
              <div>{{ error() }}</div>
              @if (isWalkInCustomer()) {
                <div class="text-xs mt-2 opacity-80">
                  Redirecting to customers list in 3 seconds...
                </div>
              }
            </div>
            @if (!isWalkInCustomer()) {
              <button (click)="clearError()" class="btn btn-ghost btn-sm">×</button>
            }
          </div>
        }

        @if (isLoading()) {
          <div class="flex justify-center items-center py-8">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        } @else if (isWalkInCustomer()) {
          <div class="text-center py-8">
            <div class="text-base-content/60">
              This customer cannot be edited. Please go back to the customers list.
            </div>
          </div>
        } @else if (customerData()) {
          <div class="space-y-6 max-w-md mx-auto">
            <!-- Basic Information (card-style for consistency) -->
            <div class="card bg-base-100 border border-base-300 shadow-sm">
              <div class="card-body p-5">
                <h2 class="text-lg font-semibold mb-1">Basic Information</h2>
                <p class="text-sm text-base-content/70 mb-4">Update business and contact details</p>
                <app-person-edit-form
                  #personFormRef
                  [initialData]="customerData()"
                  [showSubmitButton]="false"
                  [isLoading]="customerService.isCreating()"
                  (formSubmit)="onUpdateCustomer($event)"
                />
              </div>
            </div>

            <!-- Credit Management (same card style as supplier) -->
            @if (hasCreditPermission()) {
              <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-5">
                  <h2 class="text-lg font-semibold mb-1">Credit Management</h2>
                  <p class="text-sm text-base-content/70 mb-4">
                    Manage customer credit approval, limits, and duration
                  </p>

                  @if (isLoadingCredit()) {
                    <div class="flex justify-center py-4">
                      <span class="loading loading-spinner loading-md"></span>
                    </div>
                  } @else if (creditSummary()) {
                    <div class="space-y-4">
                      <!-- Credit Approval Status -->
                      <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                        <div class="flex-1 pr-3">
                          <div class="font-semibold text-sm">Credit Approval</div>
                          <div class="text-xs text-base-content/70 mt-0.5">
                            Allow customer to make credit purchases
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          class="toggle toggle-primary"
                          [checked]="creditSummary()?.isCreditApproved"
                          (change)="onToggleCreditApproval($event)"
                          [disabled]="isUpdatingCredit()"
                        />
                      </div>

                      <!-- Credit Limit -->
                      <div class="space-y-2">
                        <label class="label py-1">
                          <span class="label-text font-semibold text-sm">Credit Limit</span>
                          @if (!isEditingCreditLimit()) {
                            <span class="label-text-alt text-xs">{{
                              currencyService.format(creditSummary()?.creditLimit ?? 0)
                            }}</span>
                          }
                        </label>
                        @if (isEditingCreditLimit()) {
                          <div class="space-y-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              class="input input-bordered w-full"
                              [value]="editCreditLimitValue()"
                              (input)="
                                editCreditLimitValue.set($any($event.target).valueAsNumber ?? 0)
                              "
                              [disabled]="isUpdatingCredit()"
                            />
                            <div class="flex gap-2">
                              <button
                                class="btn btn-primary btn-sm flex-1"
                                (click)="saveCreditLimit()"
                                [disabled]="isUpdatingCredit()"
                              >
                                @if (isUpdatingCredit()) {
                                  <span class="loading loading-spinner loading-xs"></span>
                                } @else {
                                  Save
                                }
                              </button>
                              <button
                                class="btn btn-ghost btn-sm flex-1"
                                (click)="stopEditingCreditLimit()"
                                [disabled]="isUpdatingCredit()"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        } @else {
                          <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                            <span class="text-base font-semibold">{{
                              currencyService.format(creditSummary()?.creditLimit ?? 0)
                            }}</span>
                            <button
                              class="btn btn-sm btn-ghost"
                              (click)="startEditingCreditLimit()"
                              [disabled]="!creditSummary()?.isCreditApproved"
                            >
                              Edit
                            </button>
                          </div>
                        }
                      </div>

                      <!-- Credit Duration -->
                      <div class="space-y-2">
                        <label class="label py-1">
                          <span class="label-text font-semibold text-sm">Credit Duration</span>
                          @if (!isEditingCreditDuration()) {
                            <span class="label-text-alt text-xs"
                              >{{ creditSummary()?.creditDuration ?? 30 }} days</span
                            >
                          }
                        </label>
                        @if (isEditingCreditDuration()) {
                          <div class="space-y-2">
                            <input
                              type="number"
                              min="1"
                              class="input input-bordered w-full"
                              [value]="editCreditDurationValue()"
                              (input)="
                                editCreditDurationValue.set($any($event.target).valueAsNumber ?? 1)
                              "
                              [disabled]="isUpdatingCredit()"
                            />
                            <div class="flex gap-2">
                              <button
                                class="btn btn-primary btn-sm flex-1"
                                (click)="saveCreditDuration()"
                                [disabled]="isUpdatingCredit()"
                              >
                                @if (isUpdatingCredit()) {
                                  <span class="loading loading-spinner loading-xs"></span>
                                } @else {
                                  Save
                                }
                              </button>
                              <button
                                class="btn btn-ghost btn-sm flex-1"
                                (click)="stopEditingCreditDuration()"
                                [disabled]="isUpdatingCredit()"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        } @else {
                          <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                            <span class="text-base font-semibold"
                              >{{ creditSummary()?.creditDuration ?? 30 }} days</span
                            >
                            <button
                              class="btn btn-sm btn-ghost"
                              (click)="startEditingCreditDuration()"
                              [disabled]="!creditSummary()?.isCreditApproved"
                            >
                              Edit
                            </button>
                          </div>
                        }
                      </div>

                      <!-- Credit Summary -->
                      <div class="divider my-4"></div>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="stat bg-base-200 rounded-lg p-3">
                          <div class="stat-title text-xs">Outstanding</div>
                          <div class="stat-value text-base text-warning">
                            {{ currencyService.format(creditSummary()?.outstandingAmount ?? 0) }}
                          </div>
                        </div>
                        <div class="stat bg-base-200 rounded-lg p-3">
                          <div class="stat-title text-xs">Available</div>
                          <div class="stat-value text-base text-success">
                            {{ currencyService.format(creditSummary()?.availableCredit ?? 0) }}
                          </div>
                        </div>
                      </div>

                      <!-- Last Repayment Info -->
                      @if (creditSummary()?.lastRepaymentDate) {
                        <div class="alert alert-info mt-4">
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
                          <div class="text-sm">
                            <div class="font-semibold">Last Repayment</div>
                            <div>
                              {{ formatDate(creditSummary()?.lastRepaymentDate) }} -
                              {{
                                currencyService.format(creditSummary()?.lastRepaymentAmount ?? 0)
                              }}
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="text-center py-4 text-sm opacity-60">
                      Failed to load credit information
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Update Button (same position as supplier Update button) -->
            <div class="form-control mt-6">
              <button
                type="button"
                [disabled]="!isPersonFormValid() || customerService.isCreating()"
                (click)="submitCustomer()"
                class="btn btn-primary w-full"
              >
                @if (customerService.isCreating()) {
                  <span class="loading loading-spinner loading-sm"></span>
                  Updating Customer...
                } @else {
                  Update Customer
                }
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerEditComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly customerService = inject(CustomerService);
  readonly authService = inject(AuthService);
  readonly currencyService = inject(CurrencyService);
  private readonly toastService = inject(ToastService);

  readonly personFormRef = viewChild<PersonEditFormComponent>('personFormRef');

  // State
  readonly error = signal<string | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly customerData = signal<any>(null);
  readonly creditSummary = signal<CreditCustomerSummary | null>(null);
  readonly isLoadingCredit = signal<boolean>(false);
  readonly isUpdatingCredit = signal<boolean>(false);
  readonly editingCreditLimit = signal<boolean>(false);
  readonly editingCreditDuration = signal<boolean>(false);
  readonly editCreditLimitValue = signal<number>(0);
  readonly editCreditDurationValue = signal<number>(30);
  readonly isWalkInCustomer = signal<boolean>(false);

  readonly hasCreditPermission = computed(() => this.authService.hasCreditManagementPermission());

  readonly isPersonFormValid = computed(() => {
    const comp = this.personFormRef();
    return comp?.form?.valid ?? false;
  });

  constructor() {
    this.loadCustomer();
  }

  /**
   * Check if credit section should be expanded (from query param)
   */
  shouldExpandCredit(): boolean {
    return this.route.snapshot.queryParams['expandCredit'] === 'true';
  }

  /**
   * Check if customer is a walk-in customer
   */
  private isWalkIn(customer: any): boolean {
    if (!customer) return false;
    const email = customer.emailAddress?.toLowerCase() || '';
    const firstName = customer.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  }

  /**
   * Load customer data for editing
   */
  async loadCustomer(): Promise<void> {
    try {
      const customerId = this.route.snapshot.paramMap.get('id');
      if (!customerId) {
        this.error.set('Customer ID not provided');
        return;
      }

      const customer = await this.customerService.getCustomerById(customerId);
      if (customer) {
        // Check if customer is a walk-in customer
        if (this.isWalkIn(customer)) {
          this.isWalkInCustomer.set(true);
          this.error.set(
            'Walk-in customers cannot be edited. This is a system customer used for point-of-sale transactions.',
          );
          // Redirect back to customers list after 3 seconds
          setTimeout(() => {
            this.router.navigate(['/dashboard/customers']);
          }, 3000);
          return;
        }

        this.customerData.set({
          businessName: customer.firstName || '',
          contactPerson: customer.lastName || '',
          emailAddress: customer.emailAddress || '',
          phoneNumber: customer.phoneNumber || '',
        });

        // Load credit summary if user has permission
        if (this.hasCreditPermission()) {
          await this.loadCreditSummary(customerId, customer);
        }
      } else {
        this.error.set('Customer not found');
      }
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load customer');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Load credit summary for customer
   */
  async loadCreditSummary(customerId: string, customer: any): Promise<void> {
    this.isLoadingCredit.set(true);
    try {
      const base: Partial<CreditCustomerSummary> = {
        id: customerId,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer',
        phone: customer.phoneNumber,
        email: customer.emailAddress,
        isCreditApproved: customer.customFields?.isCreditApproved ?? false,
        creditLimit: customer.customFields?.creditLimit ?? 0,
        outstandingAmount: customer.customFields?.outstandingAmount ?? 0,
        lastRepaymentDate: customer.customFields?.lastRepaymentDate,
        lastRepaymentAmount: customer.customFields?.lastRepaymentAmount ?? 0,
        creditDuration: customer.customFields?.creditDuration ?? 30,
      };
      const summary = await this.customerService.getCreditSummary(customerId, base);
      this.creditSummary.set(summary);
    } catch (err: any) {
      console.error('Failed to load credit summary:', err);
      // Don't show error - credit info is optional
    } finally {
      this.isLoadingCredit.set(false);
    }
  }

  /**
   * Submit from bottom button (same position as supplier Update button)
   */
  submitCustomer(): void {
    const form = this.personFormRef()?.form;
    if (!form) return;
    form.markAllAsTouched();
    if (form.valid) {
      this.onUpdateCustomer(form.value);
    }
  }

  /**
   * Handle customer update
   */
  async onUpdateCustomer(formData: any): Promise<void> {
    this.error.set(null);

    // Safety check: prevent updating walk-in customers
    if (this.isWalkInCustomer()) {
      this.error.set('Walk-in customers cannot be edited.');
      return;
    }

    try {
      const customerId = this.route.snapshot.paramMap.get('id');
      if (!customerId) {
        this.error.set('Customer ID not provided');
        return;
      }

      // Map form data to backend format
      const updateData = {
        firstName: formData.businessName, // Business Name -> firstName
        lastName: formData.contactPerson, // Contact Person -> lastName
        emailAddress: formData.emailAddress || '', // Required by Vendure, use empty string if not provided
        phoneNumber: formData.phoneNumber,
      };

      const success = await this.customerService.updateCustomer(customerId, updateData);

      if (success) {
        // Navigate back to customers list
        this.router.navigate(['/dashboard/customers']);
      } else {
        this.error.set(this.customerService.error() || 'Failed to update customer');
      }
    } catch (err: any) {
      this.error.set(err.message || 'Failed to update customer');
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.error.set(null);
    this.customerService.clearError();
  }

  /**
   * Navigate back
   */
  goBack(): void {
    this.router.navigate(['/dashboard/customers']);
  }

  /**
   * Credit Management Methods
   */
  isEditingCreditLimit(): boolean {
    return this.editingCreditLimit();
  }

  isEditingCreditDuration(): boolean {
    return this.editingCreditDuration();
  }

  startEditingCreditLimit(): void {
    const summary = this.creditSummary();
    if (summary) {
      this.editingCreditLimit.set(true);
      this.editCreditLimitValue.set(summary.creditLimit / 100); // Display units for input
      this.stopEditingCreditDuration();
    }
  }

  stopEditingCreditLimit(): void {
    this.editingCreditLimit.set(false);
  }

  startEditingCreditDuration(): void {
    const summary = this.creditSummary();
    if (summary) {
      this.editingCreditDuration.set(true);
      this.editCreditDurationValue.set(summary.creditDuration);
      this.stopEditingCreditLimit();
    }
  }

  stopEditingCreditDuration(): void {
    this.editingCreditDuration.set(false);
  }

  async onToggleCreditApproval(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const approved = target.checked;
    const customerId = this.route.snapshot.paramMap.get('id');
    if (!customerId) return;

    this.isUpdatingCredit.set(true);
    try {
      const summary = this.creditSummary();
      // When approving, ensure we have a credit limit (default to 0 if not set)
      const creditLimit = summary?.creditLimit ?? 0;
      const creditDuration = summary?.creditDuration ?? 30;

      const updated = await this.customerService.approveCustomerCredit(
        customerId,
        approved,
        creditLimit,
        summary ?? undefined,
        creditDuration,
      );
      this.creditSummary.set(updated);
      this.toastService.show(
        'Credit Approval',
        approved
          ? 'Customer credit approval enabled successfully'
          : 'Customer credit approval disabled successfully',
        'success',
      );
    } catch (err: any) {
      console.error('Failed to update credit approval:', err);
      const errorMessage = err?.message || 'Failed to update credit approval';
      this.toastService.show('Error', errorMessage, 'error');
      // Revert checkbox on error
      target.checked = !approved;
    } finally {
      this.isUpdatingCredit.set(false);
    }
  }

  async saveCreditLimit(): Promise<void> {
    const customerId = this.route.snapshot.paramMap.get('id');
    if (!customerId) return;

    const newLimit = Math.round(Math.max(this.editCreditLimitValue(), 0) * 100); // Convert to cents
    this.isUpdatingCredit.set(true);
    try {
      const summary = this.creditSummary();
      const updated = await this.customerService.updateCustomerCreditLimit(
        customerId,
        newLimit,
        summary ?? undefined,
        summary?.creditDuration,
      );
      this.creditSummary.set(updated);
      this.stopEditingCreditLimit();
    } catch (err: any) {
      console.error('Failed to update credit limit:', err);
    } finally {
      this.isUpdatingCredit.set(false);
    }
  }

  async saveCreditDuration(): Promise<void> {
    const customerId = this.route.snapshot.paramMap.get('id');
    if (!customerId) return;

    const newDuration = Math.max(this.editCreditDurationValue(), 1);
    this.isUpdatingCredit.set(true);
    try {
      const summary = this.creditSummary();
      const updated = await this.customerService.updateCreditDuration(
        customerId,
        newDuration,
        summary ?? undefined,
      );
      this.creditSummary.set(updated);
      this.stopEditingCreditDuration();
    } catch (err: any) {
      console.error('Failed to update credit duration:', err);
    } finally {
      this.isUpdatingCredit.set(false);
    }
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }
}
