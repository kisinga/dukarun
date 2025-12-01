import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  input,
  Output,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EntityAvatarComponent } from '../../components/shared/entity-avatar.component';
import { ContactPickerService } from '../../../core/services/contact-picker.service';
import { SupplierService } from '../../../core/services/supplier.service';

/**
 * Supplier Create Component
 *
 * Mobile-optimized supplier creation form.
 * Two-step form: Basic info + Supplier-specific info.
 *
 * ARCHITECTURE: Every supplier is also a customer with additional fields.
 */
@Component({
  selector: 'app-supplier-create',
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
          <h1 class="text-lg font-semibold">Create Supplier</h1>
          <div class="w-10"></div>
          <!-- Spacer for centering -->
        </div>
      </div>

      <!-- Progress Indicator -->
      <div class="px-4 py-2 bg-base-200">
        <div class="flex items-center justify-center space-x-2 text-sm">
          <div class="flex items-center">
            <div
              [class]="
                'w-6 h-6 rounded-full flex items-center justify-center text-xs ' +
                (step() >= 1 ? 'bg-primary text-primary-content' : 'bg-base-300')
              "
            >
              1
            </div>
            <span class="ml-1">Basic Info</span>
          </div>
          <div class="w-8 h-px bg-base-300"></div>
          <div class="flex items-center">
            <div
              [class]="
                'w-6 h-6 rounded-full flex items-center justify-center text-xs ' +
                (step() >= 2 ? 'bg-primary text-primary-content' : 'bg-base-300')
              "
            >
              2
            </div>
            <span class="ml-1">Supplier Details</span>
          </div>
        </div>
      </div>

      <!-- Form Content -->
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

        <!-- Step 1: Basic Person Info -->
        @if (step() === 1) {
          <!-- Card-based form matching customer-create design -->
          <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
            <div class="card-body p-5">
              <!-- Avatar Preview -->
              <div class="flex justify-center mb-4">
                <app-entity-avatar
                  [firstName]="basicForm.value.businessName || ''"
                  [lastName]="basicForm.value.contactPerson || ''"
                  size="lg"
                />
              </div>

              <form
                [formGroup]="basicForm"
                (ngSubmit)="onBasicSubmit()"
                class="space-y-4"
              >
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
                    [class.input-error]="hasBasicError('businessName')"
                    autofocus
                  />
                  @if (hasBasicError('businessName')) {
                    <label class="label">
                      <span class="label-text-alt text-error">{{ getBasicErrorMessage('businessName') }}</span>
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
                    [class.input-error]="hasBasicError('contactPerson')"
                  />
                  @if (hasBasicError('contactPerson')) {
                    <label class="label">
                      <span class="label-text-alt text-error">{{ getBasicErrorMessage('contactPerson') }}</span>
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
                    [class.input-error]="hasBasicError('emailAddress')"
                  />
                  @if (hasBasicError('emailAddress')) {
                    <label class="label">
                      <span class="label-text-alt text-error">{{ getBasicErrorMessage('emailAddress') }}</span>
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
                    [class.input-error]="hasBasicError('phoneNumber')"
                  />
                  @if (hasBasicError('phoneNumber')) {
                    <label class="label">
                      <span class="label-text-alt text-error">{{ getBasicErrorMessage('phoneNumber') }}</span>
                    </label>
                  }
                </div>

                <!-- Submit Button -->
                <div class="form-control mt-6">
                  <button type="submit" [disabled]="basicForm.invalid" class="btn btn-primary w-full">
                    Next: Supplier Details
                  </button>
                </div>
              </form>
            </div>
          </div>
        }

        <!-- Step 2: Supplier Details -->
        @if (step() === 2) {
          <!-- Card-based form matching customer-create design -->
          <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
            <div class="card-body p-5">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">Supplier Details</h2>
                <button (click)="goToStep(1)" class="btn btn-ghost btn-sm">Edit Basic Info</button>
              </div>
              <p class="text-sm text-base-content/70 mb-4">
                Add supplier-specific information (all fields are optional).
              </p>

              <form
                [formGroup]="supplierForm"
                (ngSubmit)="onSupplierSubmit()"
                class="space-y-4"
              >
                <!-- Supplier Type -->
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-semibold">Supplier Type</span>
                    <span class="label-text-alt">Optional</span>
                  </label>
                  <select formControlName="supplierType" class="select select-bordered w-full">
                    <option value="">Select type</option>
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Wholesaler">Wholesaler</option>
                    <option value="Retailer">Retailer</option>
                    <option value="Service Provider">Service Provider</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <!-- Contact Person -->
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-semibold">Contact Person</span>
                    <span class="label-text-alt">Optional</span>
                  </label>
                  <input
                    type="text"
                    formControlName="contactPerson"
                    placeholder="Primary contact person"
                    class="input input-bordered w-full"
                  />
                </div>

                <!-- Payment Terms -->
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-semibold">Payment Terms</span>
                    <span class="label-text-alt">Optional</span>
                  </label>
                  <select formControlName="paymentTerms" class="select select-bordered w-full">
                    <option value="">Select payment terms</option>
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 60">Net 60</option>
                    <option value="COD">Cash on Delivery</option>
                    <option value="Prepaid">Prepaid</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <!-- Notes -->
                <div class="form-control">
                  <label class="label">
                    <span class="label-text font-semibold">Notes</span>
                    <span class="label-text-alt">Optional</span>
                  </label>
                  <textarea
                    formControlName="notes"
                    placeholder="Additional notes about this supplier"
                    class="textarea textarea-bordered w-full h-24 resize-none"
                  ></textarea>
                </div>

                <!-- Submit Button -->
                <div class="form-control mt-6">
                  <button
                    type="submit"
                    [disabled]="supplierService.isCreating()"
                    class="btn btn-primary w-full"
                  >
                    @if (supplierService.isCreating()) {
                      <span class="loading loading-spinner loading-sm"></span>
                      Creating Supplier...
                    } @else {
                      Create Supplier
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierCreateComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly supplierService = inject(SupplierService);
  private readonly contactPickerService = inject(ContactPickerService);

  // Inputs for composability
  readonly mode = input<'page' | 'modal'>('page');

  // Output for modal usage
  @Output() supplierCreated = new EventEmitter<string>();

  // State
  readonly step = signal<number>(1);
  readonly error = signal<string | null>(null);
  readonly isImportingContacts = signal(false);
  readonly basicForm: FormGroup;
  readonly supplierForm: FormGroup;

  constructor() {
    // Basic info form (required fields)
    this.basicForm = this.fb.group({
      businessName: ['', [Validators.required, Validators.minLength(2)]],
      contactPerson: ['', [Validators.required, Validators.minLength(2)]],
      emailAddress: ['', [Validators.email]], // Optional
      phoneNumber: ['', [Validators.required, Validators.pattern(/^07\d{8}$/)]], // Required, format: 07XXXXXXXX
    });

    // Supplier details form (all optional)
    this.supplierForm = this.fb.group({
      supplierType: [''],
      contactPerson: [''],
      paymentTerms: [''],
      notes: [''],
    });
  }

  /**
   * Handle basic info submission (Step 1)
   */
  onBasicSubmit(): void {
    if (this.basicForm.valid) {
      this.goToStep(2);
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.basicForm.controls).forEach((key) => {
        this.basicForm.get(key)?.markAsTouched();
      });
    }
  }

  /**
   * Handle supplier details submission (Step 2)
   */
  async onSupplierSubmit(): Promise<void> {
    this.error.set(null);

    try {
      // Map form data to backend format - only include basic fields at top level
      const supplierInput: any = {
        firstName: this.basicForm.value.businessName, // Business Name -> firstName
        lastName: this.basicForm.value.contactPerson, // Contact Person -> lastName
        phoneNumber: this.basicForm.value.phoneNumber,
        // Supplier-specific fields will be handled in customFields by the service
        supplierType: this.supplierForm.value.supplierType,
        contactPerson: this.supplierForm.value.contactPerson,
        paymentTerms: this.supplierForm.value.paymentTerms,
        notes: this.supplierForm.value.notes,
      };

      // Email is required by Vendure, use placeholder if not provided
      supplierInput.emailAddress =
        this.basicForm.value.emailAddress ||
        this.generatePlaceholderEmail(this.basicForm.value.businessName);

      const supplierId = await this.supplierService.createSupplier(supplierInput);

      if (supplierId) {
        // Emit event for modal usage
        this.supplierCreated.emit(supplierId);

        // Navigate only in page mode
        if (this.mode() === 'page') {
          this.router.navigate(['/dashboard/suppliers']);
        }
      } else {
        this.error.set(this.supplierService.error() || 'Failed to create supplier');
      }
    } catch (err: any) {
      this.error.set(err.message || 'Failed to create supplier');
    }
  }

  /**
   * Navigate between steps
   */
  goToStep(stepNumber: number): void {
    this.step.set(stepNumber);
    this.clearError();
  }

  /**
   * Check if basic form control has an error
   */
  hasBasicError(controlName: string, errorType?: string): boolean {
    const control = this.basicForm.get(controlName);
    if (!control) return false;

    if (errorType) {
      return control.hasError(errorType) && (control.dirty || control.touched);
    }
    return control.invalid && (control.dirty || control.touched);
  }

  /**
   * Get error message for basic form control
   */
  getBasicErrorMessage(controlName: string): string {
    const control = this.basicForm.get(controlName);
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
    this.supplierService.clearError();
  }

  /**
   * Navigate back
   */
  goBack(): void {
    if (this.step() === 2) {
      this.goToStep(1);
    } else {
      // Only navigate in page mode
      if (this.mode() === 'page') {
        this.router.navigate(['/dashboard/suppliers']);
      }
    }
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
          this.basicForm.patchValue({
            businessName: firstName,
            contactPerson: lastName || firstName,
          });
        }

        if (contactData.email) {
          this.basicForm.patchValue({ emailAddress: contactData.email });
        }

        if (contactData.phone) {
          // Format phone number to match validation pattern (07XXXXXXXX)
          const formattedPhone = this.contactPickerService.formatPhoneNumber(contactData.phone);
          if (formattedPhone) {
            this.basicForm.patchValue({ phoneNumber: formattedPhone });
          } else {
            // If formatting fails, still set the value but it will show validation error
            this.basicForm.patchValue({ phoneNumber: contactData.phone.replace(/\D/g, '').substring(0, 10) });
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
