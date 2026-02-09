import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EventEmitter,
  inject,
  input,
  OnInit,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupplierService } from '../../../core/services/supplier.service';
import { SupplierApiService } from '../../../core/services/supplier/supplier-api.service';
import { AuthPermissionsService } from '../../../core/services/auth/auth-permissions.service';
import { CreditManagementFormComponent } from '../shared/components/credit-management-form.component';
import { PageHeaderComponent } from '../shared/components/page-header.component';
import { ErrorAlertComponent } from '../shared/components/error-alert.component';
import { RejectionBannerComponent } from '../shared/components/rejection-banner.component';
import { PersonBasicInfoFormComponent } from '../shared/components/person-basic-info-form.component';
import { SupplierDetailsFormComponent } from '../shared/components/supplier-details-form.component';
import { ApprovableFormBase } from '../shared/directives/approvable-form-base.directive';

/**
 * Supplier Create/Edit Component
 *
 * Same UI for create and edit (product pattern).
 * Two-step form: Basic info + Supplier-specific info + credit.
 * Edit mode: route has id, load supplier and show step 2 pre-filled.
 */
@Component({
  selector: 'app-supplier-create',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PageHeaderComponent,
    ErrorAlertComponent,
    RejectionBannerComponent,
    PersonBasicInfoFormComponent,
    SupplierDetailsFormComponent,
    CreditManagementFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-base-100">
      <app-page-header
        [title]="isEditMode() ? 'Edit Supplier' : 'Create Supplier'"
        (backClick)="goBack()"
      />

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
            <span class="ml-1">Details &amp; Credit</span>
          </div>
        </div>
      </div>

      <div class="p-4">
        <app-rejection-banner [message]="rejectionMessage()" (dismiss)="dismissRejection()" />
        <app-error-alert [message]="error()" (dismiss)="clearError()" />

        @if (isEditMode() && isLoadingEdit()) {
          <div class="flex justify-center items-center py-12">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        } @else {
          <!-- Step 1: Basic Info only (contact person, business, email, phone) -->
          <div [class.hidden]="step() !== 1" class="space-y-4 max-w-md mx-auto">
            <app-person-basic-info-form
              #basicInfoForm
              entityType="supplier"
              (contactError)="onContactError($event)"
            />

            <!-- Next Button -->
            <div class="sticky bottom-0 bg-base-100 pt-4 pb-2 border-t border-base-300 -mx-4 px-4">
              <button
                type="button"
                [disabled]="isStep1Disabled()"
                (click)="onBasicSubmit()"
                class="btn btn-primary w-full"
              >
                Next: Details &amp; Credit
              </button>
            </div>
          </div>

          <!-- Step 2: Supplier Details + Credit -->
          @if (step() === 2) {
            <div class="space-y-4 max-w-md mx-auto">
              <app-supplier-details-form #supplierDetailsForm>
                <button edit-button (click)="goToStep(1)" class="btn btn-ghost btn-sm">
                  Edit Basic Info
                </button>
              </app-supplier-details-form>

              <app-credit-management-form
                [hasPermission]="hasCreditPermission()"
                [isReadonly]="false"
                [initialCreditLimit]="creditInitials().creditLimit"
                [initialCreditDuration]="creditInitials().creditDuration"
                [initialIsCreditApproved]="creditInitials().isCreditApproved"
                [showSummary]="true"
                (creditChange)="onCreditChange($event)"
              />
            </div>

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
                  {{ isEditMode() ? 'Updating Supplier...' : 'Creating Supplier...' }}
                } @else {
                  {{ isEditMode() ? 'Update Supplier' : 'Create Supplier' }}
                }
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class SupplierCreateComponent extends ApprovableFormBase implements OnInit, AfterViewInit {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  readonly supplierService = inject(SupplierService);
  private readonly supplierApiService = inject(SupplierApiService);
  private readonly authPermissionsService = inject(AuthPermissionsService);

  readonly basicInfoForm = viewChild<PersonBasicInfoFormComponent>('basicInfoForm');
  readonly supplierDetailsForm = viewChild<SupplierDetailsFormComponent>('supplierDetailsForm');

  // Inputs for composability
  readonly mode = input<'page' | 'modal'>('page');

  // Output for modal usage
  @Output() supplierCreated = new EventEmitter<string>();

  // Edit mode (same component for create and edit, like products)
  readonly isEditMode = signal(false);
  readonly supplierId = signal<string | null>(null);
  readonly isLoadingEdit = signal(false);
  readonly loadedSupplierData = signal<any>(null);
  readonly creditInitials = signal<{
    creditLimit: number;
    creditDuration: number;
    isCreditApproved: boolean;
  }>({ creditLimit: 0, creditDuration: 30, isCreditApproved: false });
  private readonly basicFormPatched = signal(false);
  private readonly detailsFormPatched = signal(false);

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

  constructor() {
    super();
    // When edit data is loaded, patch basic form and details form once
    effect(() => {
      const data = this.loadedSupplierData();
      if (!data) return;
      const basic = this.basicInfoForm();
      if (basic && !this.basicFormPatched()) {
        basic.getForm().patchValue({
          businessName: data.firstName || '',
          contactPerson: data.lastName || data.customFields?.contactPerson || '',
          emailAddress: data.emailAddress || '',
          phoneNumber: data.phoneNumber || '',
        });
        this.basicFormPatched.set(true);
      }
      if (this.step() === 2) {
        const details = this.supplierDetailsForm();
        if (details && !this.detailsFormPatched()) {
          const cf = data.customFields || {};
          details.getForm().patchValue({
            supplierType: cf.supplierType || '',
            paymentTerms: cf.paymentTerms || '',
            notes: cf.notes || '',
          });
          this.detailsFormPatched.set(true);
        }
      }
    });
  }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
  }

  ngOnInit(): void {
    const id = this.activatedRoute.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.supplierId.set(id);
      this.loadSupplierForEdit(id);
    }
  }

  /**
   * Load supplier for edit and pre-fill forms; show step 2
   */
  private async loadSupplierForEdit(id: string): Promise<void> {
    this.isLoadingEdit.set(true);
    this.clearError();
    try {
      const supplier = await this.supplierService.getSupplierById(id);
      if (!supplier) {
        this.error.set('Supplier not found');
        return;
      }
      const cf = supplier.customFields || {};
      this.creditInitials.set({
        creditLimit: cf.creditLimit ?? 0,
        creditDuration: cf.creditDuration ?? 30,
        isCreditApproved: !!cf.isCreditApproved,
      });
      this.creditData.set({
        creditLimit: cf.creditLimit ?? 0,
        creditDuration: cf.creditDuration ?? 30,
        isCreditApproved: !!cf.isCreditApproved,
      });
      this.loadedSupplierData.set(supplier);
      this.step.set(2);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to load supplier');
    } finally {
      this.isLoadingEdit.set(false);
    }
  }

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
   * Handle supplier details submission (Step 2) – create or update
   */
  async onSupplierSubmit(): Promise<void> {
    const basicFormComponent = this.basicInfoForm();
    const supplierFormComponent = this.supplierDetailsForm();
    if (!basicFormComponent || !supplierFormComponent) return;

    const basicForm = basicFormComponent.getForm();
    const supplierForm = supplierFormComponent.getForm();

    this.error.set(null);

    const isEdit = this.isEditMode();
    const id = this.supplierId();

    try {
      // Check for duplicate phone only when creating (or when editing and phone changed to another customer)
      if (!isEdit) {
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
      } else if (id) {
        const phoneCheck = await this.supplierApiService.checkPhoneExists(
          basicForm.value.phoneNumber,
        );
        if (phoneCheck.exists && phoneCheck.customerId !== id) {
          this.error.set(
            phoneCheck.customerName
              ? `This phone number already belongs to: ${phoneCheck.customerName}`
              : 'This phone number is already in use',
          );
          return;
        }
      }

      // Map form data to backend format (contact person from basic info only)
      const supplierInput: any = {
        firstName: basicForm.value.businessName,
        lastName: basicForm.value.contactPerson,
        phoneNumber: basicForm.value.phoneNumber,
        supplierType: supplierForm.value.supplierType,
        contactPerson: basicForm.value.contactPerson,
        paymentTerms: supplierForm.value.paymentTerms,
        notes: supplierForm.value.notes,
      };

      supplierInput.emailAddress =
        basicForm.value.emailAddress || this.generatePlaceholderEmail(basicForm.value.businessName);

      if (this.hasCreditPermission()) {
        const credit = this.creditData();
        if (credit.isCreditApproved) {
          supplierInput.isCreditApproved = credit.isCreditApproved;
          if (credit.creditLimit > 0) supplierInput.creditLimit = credit.creditLimit;
          if (credit.creditDuration > 0) supplierInput.creditDuration = credit.creditDuration;
        }
      }

      if (isEdit && id) {
        const success = await this.supplierService.updateSupplier(id, supplierInput);
        if (success) {
          this.supplierCreated.emit(id);
          if (this.mode() === 'page') {
            this.router.navigate(['/dashboard/suppliers']);
          }
        } else {
          this.error.set(this.supplierService.error() || 'Failed to update supplier');
        }
      } else {
        const supplierId = await this.supplierService.createSupplier(supplierInput);
        if (supplierId) {
          this.supplierCreated.emit(supplierId);
          if (this.mode() === 'page') {
            this.router.navigate(['/dashboard/suppliers']);
          }
        } else {
          this.error.set(this.supplierService.error() || 'Failed to create supplier');
        }
      }
    } catch (err: any) {
      this.error.set(
        err.message || (isEdit ? 'Failed to update supplier' : 'Failed to create supplier'),
      );
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

  // ApprovableFormBase overrides
  override isValid(): boolean {
    const form = this.basicInfoForm();
    if (!form) return false;
    return form.getValidationStateSignal()() === 'valid';
  }

  override serializeFormState(): Record<string, any> {
    const basicForm = this.basicInfoForm();
    const detailsForm = this.supplierDetailsForm();
    return {
      basicInfo: basicForm?.getForm().value ?? {},
      supplierDetails: detailsForm?.getForm().value ?? {},
      creditData: this.creditData(),
      step: this.step(),
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
      this.creditInitials.set(data['creditData']);
    }
    if (data['step']) {
      this.step.set(data['step']);
    }
    if (data['supplierDetails'] && this.step() === 2) {
      requestAnimationFrame(() => {
        const details = this.supplierDetailsForm();
        if (details) {
          details.getForm().patchValue(data['supplierDetails']);
        }
      });
    }
  }
}
