import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  input,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupplierService } from '../../../core/services/supplier.service';
import { SupplierApiService } from '../../../core/services/supplier/supplier-api.service';
import { AuthPermissionsService } from '../../../core/services/auth/auth-permissions.service';
import { CreditManagementFormComponent } from '../shared/components/credit-management-form.component';
import { PageHeaderComponent } from '../shared/components/page-header.component';
import { ErrorAlertComponent } from '../shared/components/error-alert.component';
import { SupplierBasicInfoFormComponent } from '../shared/components/supplier-basic-info-form.component';
import { SupplierDetailsFormComponent } from '../shared/components/supplier-details-form.component';

/**
 * Supplier Create Component
 *
 * Mobile-optimized supplier creation form.
 * Two-step form: Basic info + Supplier-specific info.
 * Uses composable components for clean separation of concerns.
 */
@Component({
  selector: 'app-supplier-create',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ErrorAlertComponent,
    SupplierBasicInfoFormComponent,
    SupplierDetailsFormComponent,
    CreditManagementFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-base-100">
      <app-page-header title="Create Supplier" (backClick)="goBack()" />

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

      <div class="p-4">
        <app-error-alert [message]="error()" (dismiss)="clearError()" />

        <!-- Basic Info Form - Always rendered but hidden in step 2 -->
        <div [class.hidden]="step() !== 1" class="space-y-4 max-w-md mx-auto">
          <app-supplier-basic-info-form #basicInfoForm (contactError)="onContactError($event)" />

          <app-credit-management-form
            [hasPermission]="hasCreditPermission()"
            [isReadonly]="false"
            [initialCreditLimit]="0"
            [initialCreditDuration]="30"
            [initialIsCreditApproved]="false"
            [showSummary]="true"
            [defaultExpanded]="false"
            (creditChange)="onCreditChange($event)"
          />

          <!-- Next Button -->
          <div class="sticky bottom-0 bg-base-100 pt-4 pb-2 border-t border-base-300 -mx-4 px-4">
            <button
              type="button"
              [disabled]="isStep1Disabled()"
              (click)="onBasicSubmit()"
              class="btn btn-primary w-full"
            >
              Next: Supplier Details
            </button>
          </div>
        </div>

        <!-- Step 2: Supplier Details -->
        @if (step() === 2) {
          <app-supplier-details-form #supplierDetailsForm>
            <button edit-button (click)="goToStep(1)" class="btn btn-ghost btn-sm">
              Edit Basic Info
            </button>

            <!-- Submit Button -->
            <div class="form-control mt-6">
              <button
                type="button"
                [disabled]="isStep2Disabled()"
                (click)="onSupplierSubmit()"
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
          </app-supplier-details-form>
        }
      </div>
    </div>
  `,
})
export class SupplierCreateComponent {
  private readonly router = inject(Router);
  readonly supplierService = inject(SupplierService);
  private readonly supplierApiService = inject(SupplierApiService);
  private readonly authPermissionsService = inject(AuthPermissionsService);

  readonly basicInfoForm = viewChild<SupplierBasicInfoFormComponent>('basicInfoForm');
  readonly supplierDetailsForm = viewChild<SupplierDetailsFormComponent>('supplierDetailsForm');

  // Inputs for composability
  readonly mode = input<'page' | 'modal'>('page');

  // Output for modal usage
  @Output() supplierCreated = new EventEmitter<string>();

  // Computed state for button disabled
  readonly isStep1Disabled = computed(() => {
    const form = this.basicInfoForm();
    if (!form) return true;

    // Read validation state signal directly to ensure reactivity
    const state = form.getValidationStateSignal()();

    // Disable if not valid
    return state !== 'valid';
  });

  readonly isStep2Disabled = computed(() => {
    const basicForm = this.basicInfoForm();
    if (!basicForm) return true;

    // Disable if service is creating
    if (this.supplierService.isCreating()) return true;

    // Read validation state signal directly to ensure reactivity
    const state = basicForm.getValidationStateSignal()();
    return (
      state === 'checking' ||
      state === 'invalid_duplicate' ||
      state === 'invalid_format' ||
      state === 'invalid_required'
    );
  });

  // State
  readonly step = signal<number>(1);
  readonly error = signal<string | null>(null);
  readonly creditData = signal<{
    creditLimit: number;
    creditDuration: number;
    isCreditApproved: boolean;
  }>({
    creditLimit: 0,
    creditDuration: 30,
    isCreditApproved: false,
  });

  /**
   * Check if user has credit management permission
   */
  hasCreditPermission(): boolean {
    return this.authPermissionsService.hasCreditManagementPermission();
  }

  /**
   * Handle credit form changes
   */
  onCreditChange(data: {
    creditLimit: number;
    creditDuration: number;
    isCreditApproved: boolean;
  }): void {
    this.creditData.set(data);
  }

  /**
   * Handle contact import error
   */
  onContactError(message: string | null): void {
    if (message) {
      this.error.set(message);
    }
  }

  /**
   * Handle basic info submission (Step 1)
   */
  onBasicSubmit(): void {
    const formComponent = this.basicInfoForm();
    if (!formComponent) return;
    const form = formComponent.getForm();

    if (form.valid) {
      this.goToStep(2);
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(form.controls).forEach((key) => {
        form.get(key)?.markAsTouched();
      });
    }
  }

  /**
   * Handle supplier details submission (Step 2)
   */
  async onSupplierSubmit(): Promise<void> {
    const basicFormComponent = this.basicInfoForm();
    const supplierFormComponent = this.supplierDetailsForm();
    if (!basicFormComponent || !supplierFormComponent) return;

    const basicForm = basicFormComponent.getForm();
    const supplierForm = supplierFormComponent.getForm();

    this.error.set(null);

    try {
      // Check for duplicate phone number before creating
      const phoneCheck = await this.supplierApiService.checkPhoneExists(
        basicForm.value.phoneNumber,
      );
      if (phoneCheck.exists) {
        this.error.set(
          phoneCheck.customerName
            ? `This phone number already belongs to: ${phoneCheck.customerName}`
            : 'This phone number is already in use',
        );
        return;
      }

      // Map form data to backend format
      const supplierInput: any = {
        firstName: basicForm.value.businessName,
        lastName: basicForm.value.contactPerson,
        phoneNumber: basicForm.value.phoneNumber,
        supplierType: supplierForm.value.supplierType,
        contactPerson: supplierForm.value.contactPerson,
        paymentTerms: supplierForm.value.paymentTerms,
        notes: supplierForm.value.notes,
      };

      // Email is required by Vendure, use placeholder if not provided
      supplierInput.emailAddress =
        basicForm.value.emailAddress || this.generatePlaceholderEmail(basicForm.value.businessName);

      // Add credit fields if user has permission and values are set
      if (this.hasCreditPermission()) {
        const credit = this.creditData();
        if (credit.isCreditApproved) {
          supplierInput.isCreditApproved = credit.isCreditApproved;
          if (credit.creditLimit > 0) {
            supplierInput.creditLimit = credit.creditLimit;
          }
          if (credit.creditDuration > 0) {
            supplierInput.creditDuration = credit.creditDuration;
          }
        }
      }

      const supplierId = await this.supplierService.createSupplier(supplierInput);

      if (supplierId) {
        this.supplierCreated.emit(supplierId);

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
      if (this.mode() === 'page') {
        this.router.navigate(['/dashboard/suppliers']);
      }
    }
  }

  /**
   * Generate a unique placeholder email based on business name
   */
  private generatePlaceholderEmail(businessName: string): string {
    const sanitizedName = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15);

    const timestamp = Date.now().toString().slice(-6);
    return `noemail-${sanitizedName}-${timestamp}@dukarun.local`;
  }
}
