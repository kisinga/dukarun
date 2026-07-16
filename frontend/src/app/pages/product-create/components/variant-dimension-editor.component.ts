import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductType, VariantDimension } from '../types/product-creation.types';

/**
 * Variant Dimension Editor Component
 *
 * Handles adding, editing, and removing variant dimensions.
 * Shows different UI for measured vs discrete products.
 */
@Component({
  selector: 'app-variant-dimension-editor',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (productType() === 'measured') {
      <!-- MEASURED Configuration -->
      <div class="card bg-base-100 shadow">
        <div class="card-body p-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold text-sm">Variants (Optional)</h3>
            <button type="button" class="btn btn-xs btn-primary" (click)="onAddDimension()">
              + Add
            </button>
          </div>
          <p class="text-xs opacity-60 mb-2">Add variants like Grade, Quality, Type</p>

          @for (dim of variantDimensions(); track dim.id) {
            <div class="bg-base-200 p-2 rounded mb-2">
              <input
                type="text"
                placeholder="Dimension name (e.g., Grade)"
                class="input input-sm input-bordered w-full mb-2"
                [(ngModel)]="dim.name"
              />
              <input
                type="text"
                placeholder="Options: A, B, C"
                class="input input-sm input-bordered w-full"
                (change)="onUpdateOptions(dim.id, $any($event.target).value)"
              />
              <button
                type="button"
                class="btn btn-xs btn-ghost mt-1"
                (click)="onRemoveDimension(dim.id)"
              >
                Remove
              </button>
            </div>
          }
        </div>
      </div>
    } @else if (productType() === 'discrete') {
      <!-- DISCRETE Configuration -->
      <div class="card bg-base-100 shadow">
        <div class="card-body p-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold text-sm">Variants</h3>
            <button type="button" class="btn btn-xs btn-primary" (click)="onAddDimension()">
              + Add
            </button>
          </div>
          <p class="text-xs opacity-60 mb-2">Add variants like Color, Size, Package Size</p>

          @for (dim of variantDimensions(); track dim.id) {
            <div class="bg-base-200 p-2 rounded mb-2">
              <input
                type="text"
                placeholder="Dimension name (e.g., Color)"
                class="input input-sm input-bordered w-full mb-2"
                [(ngModel)]="dim.name"
              />
              <input
                type="text"
                placeholder="Options: Red, Blue, Yellow"
                class="input input-sm input-bordered w-full"
                (change)="onUpdateOptions(dim.id, $any($event.target).value)"
              />
              <button
                type="button"
                class="btn btn-xs btn-ghost mt-1"
                (click)="onRemoveDimension(dim.id)"
              >
                Remove
              </button>
            </div>
          }

          <div class="bg-warning/10 p-2 rounded text-xs mt-2 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">warning</span>
            <span>Fractional sales disabled — customers buy whole units.</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class VariantDimensionEditorComponent {
  // Inputs
  readonly variantDimensions = input.required<VariantDimension[]>();
  readonly productType = input<ProductType | null>(null);

  // Outputs
  readonly addDimension = output<void>();
  readonly removeDimension = output<string>();
  readonly updateOptions = output<{ id: string; options: string[] }>();

  /**
   * Handle add dimension
   */
  onAddDimension(): void {
    this.addDimension.emit();
  }

  /**
   * Handle remove dimension
   */
  onRemoveDimension(id: string): void {
    this.removeDimension.emit(id);
  }

  /**
   * Handle update dimension options
   */
  onUpdateOptions(id: string, optionsString: string): void {
    const options = optionsString
      .split(',')
      .map((opt) => opt.trim())
      .filter((opt) => opt);
    this.updateOptions.emit({ id, options });
  }
}
