import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EntityAvatarComponent } from '../../components/shared/entity-avatar.component';
import { ContactPickerService } from '../../../core/services/contact-picker.service';
import { CustomerService } from '../../../core/services/customer.service';

/**
 * Customer Create Component
 *
 * Mobile-optimized customer creation form.
 * Redesigned to match customers page design language.
 *
 * ARCHITECTURE: Simple form with minimal required fields, consistent with customers page.
 */
@Component({
  selector: 'app-customer-create',
  imports: [CommonModule, ReactiveFormsModule, EntityAvatarComponent],
  template: `
    <div class="min-h-screen bg-base-100">
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-base-100 border-b border-base-200 px-4 py-3">
        <div class="flex items-center justify-between">
          <button (click)="goBack()" class="btn btn-ghost btn-sm btn-circle" aria-label="Go back">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>
          <h1 class="text-lg font-semibold">Create Customer</h1>
          <div class="w-10"></div>
          <!-- Spacer for centering -->
        </div>
      </div>

      <!-- Form -->
      <div class="p-4">
        @if (error()) {
          <div class="alert alert-error mb-4">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span>{{ error() }}</span>
            <button (click)="clearError()" class="btn btn-ghost btn-sm">×</button>
          </div>
        }

        <!-- Card-based form matching customers page design -->
        <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
          <div class="card-body p-5">
            <!-- Avatar Preview -->
            <div class="flex justify-center mb-4">
              <app-entity-avatar
                [firstName]="form.value.businessName || ''"
                [lastName]="form.value.contactPerson || ''"
                size="lg"
              />
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
              <!-- Contact Picker Button -->
              @if (isContactPickerSupported()) {
                <div class="form-control">
                  <button
                    type="button"
                    class="btn btn-outline btn-sm w-full"
                    (click)="importFromContacts()"
                    [disabled]="isImportingContacts()"
                  >
                    @if (isImportingContacts()) {
                      <span class="loading loading-spinner loading-xs"></span>
                      Importing...
                    } @else {
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Import from Contacts
                    }
                  </button>
                </div>
              }

              <!-- Business Name -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">Business Name *</span>
                </label>
                <input
                  type="text"
                  formControlName="businessName"
                  placeholder="Enter business name"
                  class="input input-bordered w-full"
                  [class.input-error]="hasError('businessName')"
                  autofocus
                />
                @if (hasError('businessName')) {
                  <label class="label">
                    <span class="label-text-alt text-error">{{ getErrorMessage('businessName') }}</span>
                  </label>
                }
              </div>

              <!-- Contact Person -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">Contact Person *</span>
                </label>
                <input
                  type="text"
                  formControlName="contactPerson"
                  placeholder="Enter contact person name"
                  class="input input-bordered w-full"
                  [class.input-error]="hasError('contactPerson')"
                />
                @if (hasError('contactPerson')) {
                  <label class="label">
                    <span class="label-text-alt text-error">{{ getErrorMessage('contactPerson') }}</span>
                  </label>
                }
              </div>

              <!-- Email -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">Email Address</span>
                  <span class="label-text-alt">Optional</span>
                </label>
                <input
                  type="email"
                  formControlName="emailAddress"
                  placeholder="Enter email address"
                  class="input input-bordered w-full"
                  [class.input-error]="hasError('emailAddress')"
                />
                @if (hasError('emailAddress')) {
                  <label class="label">
                    <span class="label-text-alt text-error">{{ getErrorMessage('emailAddress') }}</span>
                  </label>
                }
              </div>

              <!-- Phone Number -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">Phone Number *</span>
                </label>
                <input
                  type="tel"
                  formControlName="phoneNumber"
                  placeholder="07XXXXXXXX"
                  class="input input-bordered w-full"
                  [class.input-error]="hasError('phoneNumber')"
                />
                @if (hasError('phoneNumber')) {
                  <label class="label">
                    <span class="label-text-alt text-error">{{ getErrorMessage('phoneNumber') }}</span>
                  </label>
                }
              </div>

              <!-- Submit Button -->
              <div class="form-control mt-6">
                <button
                  type="submit"
                  [disabled]="form.invalid || customerService.isCreating()"
                  class="btn btn-primary w-full"
                >
                  @if (customerService.isCreating()) {
                    <span class="loading loading-spinner loading-sm"></span>
                    Creating...
                  } @else {
                    Create Customer
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerCreateComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly customerService = inject(CustomerService);
  private readonly contactPickerService = inject(ContactPickerService);

  // State
  readonly error = signal<string | null>(null);
  readonly isImportingContacts = signal(false);
  readonly form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      businessName: ['', [Validators.required, Validators.minLength(2)]],
      contactPerson: ['', [Validators.required, Validators.minLength(2)]],
      emailAddress: ['', [Validators.email]], // Optional
      phoneNumber: ['', [Validators.required, Validators.pattern(/^07\d{8}$/)]], // Required, format: 07XXXXXXXX
    });
  }

  /**
   * Check if Contact Picker API is supported
   */
  isContactPickerSupported(): boolean {
    return this.contactPickerService.isSupported();
  }

  /**
   * Import contact from browser contacts
   */
  async importFromContacts(): Promise<void> {
    if (!this.isContactPickerSupported()) {
      this.error.set('Contact picker is not supported in this browser');
      return;
    }

    this.isImportingContacts.set(true);
    this.error.set(null);

    try {
      const contactData = await this.contactPickerService.selectContact();

      if (contactData) {
        const { firstName, lastName } = this.contactPickerService.parseName(contactData.name);

        // Populate form fields
        if (firstName) {
          this.form.patchValue({
            businessName: firstName,
            contactPerson: lastName || firstName,
          });
        }

        if (contactData.email) {
          this.form.patchValue({ emailAddress: contactData.email });
        }

        if (contactData.phone) {
          // Format phone number to match validation pattern (07XXXXXXXX)
          const formattedPhone = this.contactPickerService.formatPhoneNumber(contactData.phone);
          if (formattedPhone) {
            this.form.patchValue({ phoneNumber: formattedPhone });
          } else {
            // If formatting fails, still set the value but it will show validation error
            this.form.patchValue({ phoneNumber: contactData.phone.replace(/\D/g, '').substring(0, 10) });
          }
        }
      }
    } catch (err: any) {
      console.error('Contact picker error:', err);
      this.error.set('Failed to import contact. Please enter manually.');
    } finally {
      this.isImportingContacts.set(false);
    }
  }

  /**
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    if (this.form.valid) {
      this.error.set(null);

      try {
        // Map form data to backend format
        const customerData = {
          firstName: this.form.value.businessName, // Business Name -> firstName
          lastName: this.form.value.contactPerson, // Contact Person -> lastName
          emailAddress:
            this.form.value.emailAddress ||
            this.generatePlaceholderEmail(this.form.value.businessName),
          phoneNumber: this.form.value.phoneNumber,
        };

        const customerId = await this.customerService.createCustomer(customerData);

        if (customerId) {
          // Navigate back to customers list
          this.router.navigate(['/dashboard/customers']);
        } else {
          this.error.set(this.customerService.error() || 'Failed to create customer');
        }
      } catch (err: any) {
        this.error.set(err.message || 'Failed to create customer');
      }
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.form.controls).forEach((key) => {
        this.form.get(key)?.markAsTouched();
      });
    }
  }

  /**
   * Check if a form control has an error
   */
  hasError(controlName: string, errorType?: string): boolean {
    const control = this.form.get(controlName);
    if (!control) return false;

    if (errorType) {
      return control.hasError(errorType) && (control.dirty || control.touched);
    }
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Get error message for a form control
   */
  getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control || !control.errors) return '';

    const errors = control.errors;
    if (errors['required']) return 'This field is required';
    if (errors['minlength']) {
      return `Minimum ${errors['minlength'].requiredLength} characters required`;
    }
    if (errors['email']) return 'Please enter a valid email address';
    if (errors['pattern']) return 'Phone must be in format 07XXXXXXXX (10 digits starting with 07)';

    return 'Invalid value';
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
   * Generate a unique placeholder email based on business name
   * Required by Vendure since emailAddress is mandatory
   */
  private generatePlaceholderEmail(businessName: string): string {
    // Create a sanitized version of the business name for email
    const sanitizedName = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
      .substring(0, 15); // Limit length to keep email reasonable

    // Add timestamp to ensure uniqueness
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp

    return `noemail-${sanitizedName}-${timestamp}@dukarun.local`;
  }
}
