import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ItemType } from '../types/product-creation.types';

/**
 * Product Name Input Component
 *
 * Clear fieldset with visible label and helper text.
 * Adapts placeholder and hint based on item type.
 */
@Component({
  selector: 'app-product-name-input',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-sm font-medium text-base-content/70">{{ label() }}</legend>
      <input
        type="text"
        [formControl]="nameControl()"
        [placeholder]="placeholder()"
        class="input input-bordered w-full"
        [class.input-error]="nameControl().invalid && nameControl().touched"
      />
      <p class="label text-xs mt-1">
        @if (nameControl().invalid && nameControl().touched) {
          <span class="text-error">Name is required (min 3 characters)</span>
        } @else {
          <span class="text-base-content/50">{{ hint() }}</span>
        }
      </p>
    </fieldset>
  `,
})
export class ProductNameInputComponent {
  // Inputs
  readonly nameControl = input.required<FormControl>();
  readonly itemType = input<ItemType>('product');

  // Computed values based on item type
  readonly label = computed(() =>
    this.itemType() === 'service' ? 'Service name' : 'Product name'
  );

  readonly placeholder = computed(() =>
    this.itemType() === 'service'
      ? 'e.g. Haircut, Car Wash'
      : 'e.g. Coca-Cola, Tomatoes'
  );

  readonly hint = computed(() =>
    this.itemType() === 'service'
      ? 'Enter a clear name for your service'
      : 'Enter the product name as it appears on the label'
  );
}
