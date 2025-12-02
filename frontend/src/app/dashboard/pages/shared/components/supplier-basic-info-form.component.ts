import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EntityAvatarComponent } from '../../../components/shared/entity-avatar.component';
import { ContactPickerButtonComponent } from './contact-picker-button.component';
import { ContactPickerService } from '../../../../core/services/contact-picker.service';
import { ValidationState } from './basic-info-form.types';
import { BasicInfoFormHelper } from './basic-info-form.helper';

// Re-export types for convenience
export type { ValidationState };

/**
 * Supplier Basic Info Form Component
 *
 * Form for basic supplier information with phone duplicate validation.
 */
@Component({
  selector: 'app-supplier-basic-info-form',
  imports: [CommonModule, ReactiveFormsModule, EntityAvatarComponent, ContactPickerButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="collapse collapse-arrow bg-base-100 border border-base-300 shadow-sm">
      <input type="checkbox" checked />
      <div class="collapse-title text-lg font-semibold px-4 py-3">📋 Basic Information</div>
      <div class="collapse-content px-4 pb-4">
        <!-- Avatar Preview -->
        <div class="flex justify-center mb-4">
          <app-entity-avatar
            [firstName]="form.value.businessName || ''"
            [lastName]="form.value.contactPerson || ''"
            size="lg"
          />
        </div>

        <form [formGroup]="form" class="space-y-4">
          <!-- Contact Picker Button -->
          <app-contact-picker-button
            (contactImported)="onContactImported($event)"
            (error)="onContactError($event)"
          />

          <!-- Business Name -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">
                Business Name <span class="text-error">*</span>
              </span>
            </label>
            <input
              type="text"
              formControlName="businessName"
              placeholder="Enter business name"
              class="input input-bordered w-full"
              [class.input-error]="
                form.get('businessName')?.invalid &&
                (form.get('businessName')?.dirty || form.get('businessName')?.touched)
              "
              autofocus
            />
            @if (
              form.get('businessName')?.invalid &&
              (form.get('businessName')?.dirty || form.get('businessName')?.touched)
            ) {
              <label class="label">
                <span class="label-text-alt text-error">
                  @if (form.get('businessName')?.hasError('required')) {
                    This field is required
                  } @else if (form.get('businessName')?.hasError('minlength')) {
                    Business name must be at least 2 characters
                  }
                </span>
              </label>
            }
          </div>

          <!-- Contact Person -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">
                Contact Person <span class="text-error">*</span>
              </span>
            </label>
            <input
              type="text"
              formControlName="contactPerson"
              placeholder="Enter contact person name"
              class="input input-bordered w-full"
              [class.input-error]="
                form.get('contactPerson')?.invalid &&
                (form.get('contactPerson')?.dirty || form.get('contactPerson')?.touched)
              "
            />
            @if (
              form.get('contactPerson')?.invalid &&
              (form.get('contactPerson')?.dirty || form.get('contactPerson')?.touched)
            ) {
              <label class="label">
                <span class="label-text-alt text-error">
                  @if (form.get('contactPerson')?.hasError('required')) {
                    This field is required
                  } @else if (form.get('contactPerson')?.hasError('minlength')) {
                    Contact person name must be at least 2 characters
                  }
                </span>
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
              [class.input-error]="
                form.get('emailAddress')?.invalid &&
                (form.get('emailAddress')?.dirty || form.get('emailAddress')?.touched)
              "
            />
            @if (
              form.get('emailAddress')?.invalid &&
              (form.get('emailAddress')?.dirty || form.get('emailAddress')?.touched)
            ) {
              <label class="label">
                <span class="label-text-alt text-error">Please enter a valid email address</span>
              </label>
            }
          </div>

          <!-- Phone Number -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">
                Phone Number <span class="text-error">*</span>
              </span>
            </label>
            <input
              type="tel"
              formControlName="phoneNumber"
              placeholder="07XXXXXXXX"
              class="input input-bordered w-full"
              [class.input-error]="
                form.get('phoneNumber')?.invalid &&
                (form.get('phoneNumber')?.dirty || form.get('phoneNumber')?.touched)
              "
            />
            @if (
              form.get('phoneNumber')?.invalid &&
              (form.get('phoneNumber')?.dirty || form.get('phoneNumber')?.touched)
            ) {
              <label class="label">
                <span class="label-text-alt text-error">{{ getPhoneError() }}</span>
              </label>
            }
          </div>
        </form>
      </div>
    </div>
  `,
})
export class SupplierBasicInfoFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly contactPickerService = inject(ContactPickerService);

  // Outputs
  readonly contactError = output<string | null>();

  // Form
  readonly form: FormGroup;
  private readonly formValid = signal<boolean>(false);

  constructor() {
    this.form = this.fb.group({
      businessName: ['', [Validators.required, Validators.minLength(2)]],
      contactPerson: ['', [Validators.required, Validators.minLength(2)]],
      emailAddress: ['', [Validators.email]], // Optional
      phoneNumber: ['', [Validators.required, Validators.pattern(/^07\d{8}$/)]],
    });

    // Track form validity changes
    effect(() => {
      const statusSub = this.form.statusChanges.subscribe(() => {
        this.formValid.set(this.form.valid);
      });
      const valueSub = this.form.valueChanges.subscribe(() => {
        this.formValid.set(this.form.valid);
      });
      this.formValid.set(this.form.valid);
      return () => {
        statusSub.unsubscribe();
        valueSub.unsubscribe();
      };
    });
  }

  // Overall validation state
  readonly validationState = computed<ValidationState>(() => {
    // Check form validity from signal
    if (this.formValid()) {
      return 'valid';
    }

    // Check for specific errors
    const businessName = this.form.get('businessName');
    const contactPerson = this.form.get('contactPerson');
    const phoneControl = this.form.get('phoneNumber');

    if (!businessName?.value || !contactPerson?.value || !phoneControl?.value) {
      return 'invalid_required';
    }

    if (phoneControl?.hasError('pattern')) {
      return 'invalid_format';
    }

    return 'invalid_required';
  });

  getPhoneError(): string {
    const control = this.form.get('phoneNumber');
    if (!control?.errors) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('pattern')) {
      return 'Phone must be in format 07XXXXXXXX (10 digits starting with 07)';
    }
    return '';
  }

  getValidationState(): ValidationState {
    return this.validationState();
  }

  getValidationStateSignal() {
    return this.validationState;
  }

  onContactImported(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }): void {
    BasicInfoFormHelper.handleContactImport(this.form, this.contactPickerService, data);
  }

  onContactError(message: string | null): void {
    this.contactError.emit(message);
  }

  getForm(): FormGroup {
    return this.form;
  }
}
