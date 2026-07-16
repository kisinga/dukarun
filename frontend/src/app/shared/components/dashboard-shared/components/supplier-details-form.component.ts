import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * Supplier Details Form Component
 *
 * Single optional field: supplier type. Rendered inline (no card) so it does not
 * read as an independent section; matches customer form flow.
 */
@Component({
  selector: 'app-supplier-details-form',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 border border-base-300 shadow-sm max-w-md mx-auto">
      <div class="card-body p-4">
        <form [formGroup]="form">
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text font-semibold">Supplier Type</span>
              <span class="label-text-alt text-base-content/60">Optional</span>
            </label>
            <select
              formControlName="supplierType"
              class="select select-bordered w-full select-md bg-base-100"
            >
              <option value="">Select type</option>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Distributor">Distributor</option>
              <option value="Wholesaler">Wholesaler</option>
              <option value="Retailer">Retailer</option>
              <option value="Service Provider">Service Provider</option>
              <option value="Other">Other</option>
            </select>
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
    });
  }

  /**
   * Get the form instance
   */
  getForm(): FormGroup {
    return this.form;
  }
}
