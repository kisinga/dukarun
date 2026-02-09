import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * Supplier Details Form Component
 *
 * Form for supplier-specific information (all fields optional).
 */
@Component({
  selector: 'app-supplier-details-form',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
      <div class="card-body p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Supplier Details</h2>
          <ng-content select="[edit-button]"></ng-content>
        </div>
        <p class="text-sm text-base-content/70 mb-4">
          Add supplier-specific information (all fields are optional).
        </p>

        <form [formGroup]="form" class="space-y-4">
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

          <ng-content></ng-content>
        </form>
      </div>
    </div>
  `,
})
export class SupplierDetailsFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      supplierType: [''],
      paymentTerms: [''],
      notes: [''],
    });
  }

  /**
   * Get the form instance
   */
  getForm(): FormGroup {
    return this.form;
  }
}
