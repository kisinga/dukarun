import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { HowSoldPreset } from '../types/product-creation.types';

/**
 * How Sold Selector
 *
 * Lets the user pick how the item is sold. Clean grid with icons.
 * Focused on the 4 preset options only.
 */
@Component({
  selector: 'app-how-sold-selector',
  imports: [CommonModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <h3 class="text-sm font-medium text-base-content/70">How is it sold?</h3>

      <div class="grid grid-cols-2 gap-1.5">
        <!-- Single item -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'single-item'"
          [class.btn-ghost]="selected() !== 'single-item'"
          [class.border-base-300]="selected() !== 'single-item'"
          (click)="onSelect('single-item')"
        >
          <ng-icon name="heroCube" size="1rem" />
          <span class="text-xs font-medium">Single item</span>
        </button>

        <!-- Multiple variants -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'multi-variant'"
          [class.btn-ghost]="selected() !== 'multi-variant'"
          [class.border-base-300]="selected() !== 'multi-variant'"
          (click)="onSelect('multi-variant')"
        >
          <ng-icon name="heroSquares2x2" size="1rem" />
          <span class="text-xs font-medium">Sizes / Packs</span>
        </button>

        <!-- Weight / Volume / Length: unit chosen from dropdown -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'by-measure'"
          [class.btn-ghost]="selected() !== 'by-measure'"
          [class.border-base-300]="selected() !== 'by-measure'"
          (click)="onSelect('by-measure')"
        >
          <!-- Scale/weight icon -->
          <ng-icon name="heroScale" size="1rem" />
          <span class="text-xs font-medium">Weight / Volume / Length</span>
        </button>

        <!-- Custom -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'by-volume-litre'"
          [class.btn-ghost]="selected() !== 'by-volume-litre'"
          [class.border-base-300]="selected() !== 'by-volume-litre'"
          (click)="onSelect('by-volume-litre')"
        >
          <!-- Beaker/liquid icon -->
          <ng-icon name="heroBeaker" size="1rem" />
          <span class="text-xs font-medium">Custom</span>
        </button>
      </div>

      <!-- Unit dropdown when Weight/Volume/Length is selected (same options as measurement-unit-selector) -->
      @if (selected() === 'by-measure') {
        <div class="pt-1.5">
          <select
            class="select select-bordered select-sm w-full max-w-xs"
            [value]="measurementUnit() ?? 'KG'"
            (change)="onUnitChange($any($event.target).value)"
          >
            <option value="">Select unit...</option>
            <optgroup label="Weight">
              <option value="KG">Kilograms (kg)</option>
              <option value="G">Grams (g)</option>
              <option value="LB">Pounds (lb)</option>
            </optgroup>
            <optgroup label="Volume">
              <option value="L">Liters (L)</option>
              <option value="ML">Milliliters (mL)</option>
              <option value="GAL">Gallons (gal)</option>
            </optgroup>
            <optgroup label="Length">
              <option value="M">Meters (m)</option>
              <option value="CM">Centimeters (cm)</option>
              <option value="FT">Feet (ft)</option>
            </optgroup>
            <optgroup label="Area">
              <option value="M2">Square Meters (m²)</option>
            </optgroup>
          </select>
        </div>
      }
    </div>
  `,
})
export class HowSoldSelectorComponent {
  readonly selected = input<HowSoldPreset | null>(null);
  readonly selectedChange = output<HowSoldPreset>();
  readonly measurementUnit = input<string | null>(null);
  readonly measurementUnitChange = output<string>();

  onSelect(preset: HowSoldPreset): void {
    this.selectedChange.emit(preset);
  }

  onUnitChange(unit: string): void {
    this.measurementUnitChange.emit(unit);
  }
}
