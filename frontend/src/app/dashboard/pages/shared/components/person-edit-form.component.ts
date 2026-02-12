import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { phoneValidator } from '../../../../core/utils/phone.utils';

/**
 * Shared Person Edit Form Component
 *
 * Reusable form for editing person information (customers and suppliers).
 * Mobile-optimized with validation and error handling.
 *
 * REUSABLE: Used by both customer and supplier edit forms.
 */
@Component({
  selector: 'app-person-edit-form',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .input-wrapper:focus-within .label-text {
        color: oklch(var(--p));
      }
      .form-container {
        max-width: 100%;
        padding: 1rem;
      }
      @media (min-width: 640px) {
        .form-container {
          max-width: 500px;
          margin: 0 auto;
        }
      }
    `,
  ],
  template: `
    <div class="form-container">
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
        <!-- Business Name -->
        <div class="input-wrapper">
          <label class="text-sm font-semibold label-text mb-1 block"> 🏢 Business Name * </label>
          <input
            type="text"
            formControlName="businessName"
            placeholder="Enter business name"
            class="input input-bordered w-full"
            [class.input-error]="hasError('businessName')"
            autofocus
          />
          @if (hasError('businessName')) {
            <p class="text-error text-xs mt-1">{{ getErrorMessage('businessName') }}</p>
          }
        </div>

        <!-- Contact Person -->
        <div class="input-wrapper">
          <label class="text-sm font-semibold label-text mb-1 block"> 👤 Contact Person * </label>
          <input
            type="text"
            formControlName="contactPerson"
            placeholder="Enter contact person name"
            class="input input-bordered w-full"
            [class.input-error]="hasError('contactPerson')"
          />
          @if (hasError('contactPerson')) {
            <p class="text-error text-xs mt-1">{{ getErrorMessage('contactPerson') }}</p>
          }
        </div>

        <!-- Email -->
        <div class="input-wrapper">
          <label class="text-sm font-semibold label-text mb-1 block"> 📧 Email Address </label>
          <input
            type="email"
            formControlName="emailAddress"
            placeholder="Enter email address (optional)"
            class="input input-bordered w-full"
            [class.input-error]="hasError('emailAddress')"
          />
          @if (hasError('emailAddress')) {
            <p class="text-error text-xs mt-1">{{ getErrorMessage('emailAddress') }}</p>
          }
        </div>

        <!-- Phone Number -->
        <div class="input-wrapper">
          <label class="text-sm font-semibold label-text mb-1 block"> 📱 Phone Number * </label>
          <input
            type="tel"
            formControlName="phoneNumber"
            placeholder="0XXXXXXXXX"
            class="input input-bordered w-full"
            [class.input-error]="hasError('phoneNumber')"
          />
          @if (hasError('phoneNumber')) {
            <p class="text-error text-xs mt-1">{{ getErrorMessage('phoneNumber') }}</p>
          }
        </div>

        @if (showSubmitButton()) {
          <!-- Submit Button -->
          <div class="pt-4">
            <button
              type="submit"
              [disabled]="form.invalid || isLoading()"
              class="btn btn-primary w-full"
            >
              @if (isLoading()) {
                <span class="loading loading-spinner loading-sm"></span>
                Updating...
              } @else {
                {{ submitButtonText() }}
              }
            </button>
          </div>
        }
      </form>
    </div>
  `,
})
export class PersonEditFormComponent {
  // Inputs
  readonly initialData = input<{
    businessName: string;
    contactPerson: string;
    emailAddress?: string;
    phoneNumber?: string;
  }>({ businessName: '', contactPerson: '' });
  readonly submitButtonText = input<string>('Update');
  readonly showSubmitButton = input<boolean>(true);
  readonly isLoading = input<boolean>(false);

  // Outputs
  readonly formSubmit = output<{
    businessName: string;
    contactPerson: string;
    emailAddress?: string;
    phoneNumber: string;
  }>();

  // Form
  readonly form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      businessName: ['', [Validators.required, Validators.minLength(2)]],
      contactPerson: ['', [Validators.required, Validators.minLength(2)]],
      emailAddress: ['', [Validators.email]],
      phoneNumber: ['', [Validators.required, phoneValidator]],
    });

    // Watch for initial data changes using effect
    effect(() => {
      const data = this.initialData();
      if (data) {
        this.form.patchValue(data);
      }
    });
  }

  /**
   * Handle form submission
   */
  onSubmit(): void {
    if (this.form.valid) {
      this.formSubmit.emit(this.form.value);
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
    if (errors['phoneFormat'])
      return 'Phone must be 0XXXXXXXXX (10 digits starting with 0, mobile or landline)';

    return 'Invalid value';
  }
}
