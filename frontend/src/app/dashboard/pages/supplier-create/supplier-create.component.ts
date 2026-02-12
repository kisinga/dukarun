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
import { PurchasePaymentService } from '../../../core/services/purchase/purchase-payment.service';
import { AuthPermissionsService } from '../../../core/services/auth/auth-permissions.service';
import { ToastService } from '../../../core/services/toast.service';
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
 * Single-page form (same pattern as customer create/edit): Basic info, Supplier details, Credit management.
 * Edit mode: route has id, load supplier and pre-fill all sections.
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

      <div class="p-4">
        <app-rejection-banner [message]="rejectionMessage()" (dismiss)="dismissRejection()" />
        <app-error-alert [message]="error()" (dismiss)="clearError()" />

        @if (isEditMode() && isLoadingEdit()) {
          <div class="flex justify-center items-center py-12">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        } @else {
          <div class="space-y-4 max-w-md mx-auto">
            <!-- Basic Information (same layout as customer create) -->
            <app-person-basic-info-form
              #basicInfoForm
              entityType="supplier"
              (contactError)="onContactError($event)"
            />

            <!-- Supplier type (single optional field, inline) -->
            <app-supplier-details-form #supplierDetailsForm />

            <!-- Credit Management -->
            <app-credit-management-form
              [hasPermission]="hasCreditPermission()"
              [isReadonly]="false"
              [initialCreditLimit]="creditInitials().creditLimit"
              [initialCreditDuration]="creditInitials().creditDuration"
              [initialIsCreditApproved]="creditInitials().isCreditApproved"
              [showSummary]="true"
              (creditChange)="onCreditChange($event)"
            />

            <!-- Submit Button -->
            <div class="sticky bottom-0 bg-base-100 pt-4 pb-2 border-t border-base-300 -mx-4 px-4">
              <button
                type="button"
                [disabled]="isSubmitDisabled()"
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
          </div>
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
  private readonly purchasePaymentService = inject(PurchasePaymentService);
  private readonly authPermissionsService = inject(AuthPermissionsService);
  private readonly toastService = inject(ToastService);

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

  // Submit disabled when basic form invalid or creating (same as customer create)
  readonly isSubmitDisabled = computed(() => {
    const form = this.basicInfoForm();
    if (!form) return true;
    if (this.supplierService.isCreating()) return true;
    return form.getValidationStateSignal()() !== 'valid';
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
      const details = this.supplierDetailsForm();
      if (details && !this.detailsFormPatched()) {
        const cf = data.customFields || {};
        details.getForm().patchValue({
          supplierType: cf.supplierType || '',
        });
        this.detailsFormPatched.set(true);
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
   * Load supplier for edit and pre-fill all form sections (single-page).
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
        creditLimit: cf.supplierCreditLimit ?? 0,
        creditDuration: cf.supplierCreditDuration ?? 30,
        isCreditApproved: !!cf.isSupplierCreditApproved,
      });
      this.creditData.set({
        creditLimit: cf.supplierCreditLimit ?? 0,
        creditDuration: cf.supplierCreditDuration ?? 30,
        isCreditApproved: !!cf.isSupplierCreditApproved,
      });
      this.loadedSupplierData.set(supplier);
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
   * Handle form submit – create or update supplier
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

      // Map form data to backend format (contact person from basic info only; payment terms removed in favor of credit duration)
      const supplierInput: any = {
        firstName: basicForm.value.businessName,
        lastName: basicForm.value.contactPerson,
        phoneNumber: basicForm.value.phoneNumber,
        supplierType: supplierForm.value.supplierType,
        contactPerson: basicForm.value.contactPerson,
      };

      supplierInput.emailAddress =
        basicForm.value.emailAddress || this.generatePlaceholderEmail(basicForm.value.businessName);

      if (this.hasCreditPermission()) {
        const credit = this.creditData();
        if (isEdit) {
          // Always send full credit state on update so backend persists it
          supplierInput.isCreditApproved = credit.isCreditApproved;
          supplierInput.creditLimit = credit.creditLimit ?? 0;
          supplierInput.creditDuration = credit.creditDuration ?? 30;
        } else {
          if (credit.isCreditApproved) {
            supplierInput.isCreditApproved = credit.isCreditApproved;
            if (credit.creditLimit > 0) supplierInput.creditLimit = credit.creditLimit;
            if (credit.creditDuration > 0) supplierInput.creditDuration = credit.creditDuration;
          }
        }
      }

      if (isEdit && id) {
        const success = await this.supplierService.updateSupplier(id, supplierInput);
        if (success) {
          // Persist credit via credit plugin (updateCustomer does not persist customFields reliably)
          if (this.hasCreditPermission()) {
            const credit = this.creditData();
            try {
              await this.purchasePaymentService.approveSupplierCredit(
                id,
                credit.isCreditApproved,
                credit.creditLimit ?? 0,
                credit.creditDuration ?? 30,
              );
            } catch (err: any) {
              console.error('Supplier credit update failed:', err);
              this.toastService.show(
                'Credit',
                err?.message || 'Supplier saved but credit update failed',
                'error',
              );
            }
          }
          this.clearError();
          this.toastService.show('Success', 'Supplier updated', 'success');
          this.supplierCreated.emit(id);
          if (this.mode() === 'page') {
            this.router.navigate(['/dashboard/suppliers']);
          }
        } else {
          const errMsg = this.supplierService.error() || 'Failed to update supplier';
          this.error.set(errMsg);
          this.toastService.show('Error', errMsg, 'error');
        }
      } else {
        const supplierId = await this.supplierService.createSupplier(supplierInput);
        if (supplierId) {
          this.clearError();
          this.toastService.show('Success', 'Supplier created', 'success');
          this.supplierCreated.emit(supplierId);
          if (this.mode() === 'page') {
            this.router.navigate(['/dashboard/suppliers']);
          }
        } else {
          const errMsg = this.supplierService.error() || 'Failed to create supplier';
          this.error.set(errMsg);
          this.toastService.show('Error', errMsg, 'error');
        }
      }
    } catch (err: any) {
      this.error.set(
        err.message || (isEdit ? 'Failed to update supplier' : 'Failed to create supplier'),
      );
    }
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
    if (this.mode() === 'page') {
      this.router.navigate(['/dashboard/suppliers']);
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
    if (data['supplierDetails']) {
      requestAnimationFrame(() => {
        const details = this.supplierDetailsForm();
        if (details) {
          details.getForm().patchValue(data['supplierDetails']);
        }
      });
    }
  }
}
