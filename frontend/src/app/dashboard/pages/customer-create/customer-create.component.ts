import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CustomerService } from '../../../core/services/customer.service';
import { CustomerApiService } from '../../../core/services/customer/customer-api.service';
import { AuthPermissionsService } from '../../../core/services/auth/auth-permissions.service';
import { CreditManagementFormComponent } from '../shared/components/credit-management-form.component';
import { PageHeaderComponent } from '../shared/components/page-header.component';
import { ErrorAlertComponent } from '../shared/components/error-alert.component';
import { RejectionBannerComponent } from '../shared/components/rejection-banner.component';
import { PersonBasicInfoFormComponent } from '../shared/components/person-basic-info-form.component';
import { ApprovableFormBase } from '../shared/directives/approvable-form-base.directive';

/**
 * Customer Create Component
 *
 * Mobile-optimized customer creation form.
 * Uses composable components for clean separation of concerns.
 */
@Component({
  selector: 'app-customer-create',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ErrorAlertComponent,
    RejectionBannerComponent,
    PersonBasicInfoFormComponent,
    CreditManagementFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-base-100">
      <app-page-header title="Create Customer" (backClick)="goBack()" />

      <div class="p-4">
        <app-rejection-banner [message]="rejectionMessage()" (dismiss)="dismissRejection()" />
        <app-error-alert [message]="error()" (dismiss)="clearError()" />

        <div class="space-y-4 max-w-md mx-auto">
          <!-- Basic Information Form -->
          <app-person-basic-info-form
            #basicInfoForm
            entityType="customer"
            (contactError)="onContactError($event)"
          />

          <!-- Credit Management Section -->
          <app-credit-management-form
            [hasPermission]="hasCreditPermission()"
            [isReadonly]="false"
            [initialCreditLimit]="0"
            [initialCreditDuration]="30"
            [initialIsCreditApproved]="false"
            [showSummary]="true"
            (creditChange)="onCreditChange($event)"
          />

          <!-- Submit Button -->
          <div class="sticky bottom-0 bg-base-100 pt-4 pb-2 border-t border-base-300 -mx-4 px-4">
            <button
              type="button"
              [disabled]="isSubmitDisabled()"
              (click)="onSubmit()"
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
        </div>
      </div>
    </div>
  `,
})
export class CustomerCreateComponent extends ApprovableFormBase implements AfterViewInit {
  private readonly router = inject(Router);
  readonly customerService = inject(CustomerService);
  private readonly customerApiService = inject(CustomerApiService);
  private readonly authPermissionsService = inject(AuthPermissionsService);

  readonly basicInfoForm = viewChild<PersonBasicInfoFormComponent>('basicInfoForm');

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
  }

  // Computed state for button disabled
  readonly isSubmitDisabled = computed(() => {
    const form = this.basicInfoForm();
    if (!form) return true;

    // Disable if service is creating
    if (this.customerService.isCreating()) return true;

    // Read validation state signal directly to ensure reactivity
    const state = form.getValidationStateSignal()();

    // Disable if not valid
    return state !== 'valid';
  });

  // State
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
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    const formComponent = this.basicInfoForm();
    if (!formComponent) return;
    const form = formComponent.getForm();
    if (form.valid) {
      this.error.set(null);

      try {
        // Check for duplicate phone number before creating
        const phoneCheck = await this.customerApiService.checkPhoneExists(form.value.phoneNumber);
        if (phoneCheck.exists) {
          this.error.set(
            phoneCheck.customerName
              ? `This phone number already belongs to: ${phoneCheck.customerName}`
              : 'This phone number is already in use',
          );
          return;
        }

        // Map form data to backend format
        const customerData: any = {
          firstName: form.value.businessName,
          lastName: form.value.contactPerson,
          emailAddress:
            form.value.emailAddress || this.generatePlaceholderEmail(form.value.businessName),
          phoneNumber: form.value.phoneNumber,
        };

        // Add credit fields if user has permission and values are set
        if (this.hasCreditPermission()) {
          const credit = this.creditData();
          if (credit.isCreditApproved) {
            customerData.isCreditApproved = credit.isCreditApproved;
            if (credit.creditLimit > 0) {
              customerData.creditLimit = credit.creditLimit;
            }
            if (credit.creditDuration > 0) {
              customerData.creditDuration = credit.creditDuration;
            }
          }
        }

        const customerId = await this.customerService.createCustomer(customerData);

        if (customerId) {
          this.router.navigate(['/dashboard/customers']);
        } else {
          this.error.set(this.customerService.error() || 'Failed to create customer');
        }
      } catch (err: any) {
        this.error.set(err.message || 'Failed to create customer');
      }
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(form.controls).forEach((key) => {
        form.get(key)?.markAsTouched();
      });
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

  // ApprovableFormBase overrides
  override isValid(): boolean {
    const form = this.basicInfoForm();
    if (!form) return false;
    return form.getValidationStateSignal()() === 'valid';
  }

  override serializeFormState(): Record<string, any> {
    const form = this.basicInfoForm();
    return {
      basicInfo: form?.getForm().value ?? {},
      creditData: this.creditData(),
    };
  }

  override restoreFormState(data: Record<string, any>): void {
    if (!data) return;
    if (data['basicInfo']) {
      const form = this.basicInfoForm();
      if (form) {
        form.getForm().patchValue(data['basicInfo']);
      }
    }
    if (data['creditData']) {
      this.creditData.set(data['creditData']);
    }
  }
}
