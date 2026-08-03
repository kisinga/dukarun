import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * Service SKU Editor Component
 *
 * Simplified SKU editor for services.
 * Shows only name and price fields.
 */
@Component({
  selector: 'app-service-sku-editor',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow">
      <div class="card-body p-3">
        <h3 class="font-bold text-sm">Service Details</h3>
        <p class="text-xs opacity-60 mb-2">Services are sold as whole units only</p>

        <!-- Single SKU for service -->
        <div [formGroup]="skuFormGroup()" class="space-y-2">
          <div>
            <label class="text-xs opacity-70 mb-1 block">Service Name</label>
            <input
              type="text"
              formControlName="name"
              placeholder="e.g., Haircut"
              class="input input-sm input-bordered w-full"
            />
          </div>

          <div>
            <label class="text-xs opacity-70 mb-1 block">Price</label>
            <input
              type="number"
              formControlName="price"
              placeholder="1"
              step="1"
              min="1"
              class="input input-sm input-bordered w-full"
            />
          </div>

          <input type="hidden" formControlName="sku" />
          <input type="hidden" formControlName="stockOnHand" value="0" />
          <input type="hidden" formControlName="allowFractionalQuantity" value="false" />
        </div>
      </div>
    </div>
  `,
})
export class ServiceSkuEditorComponent {
  // Inputs
  readonly skuFormGroup = input.required<FormGroup>();
}
