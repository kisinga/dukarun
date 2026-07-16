import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * Measurement Unit Selector Component
 *
 * Handles unit selection for measured products.
 * Only visible when product type is 'measured'.
 * Design matches size-template-selector for visual harmony.
 */
@Component({
  selector: 'app-measurement-unit-selector',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="space-y-2 anim-fade-in-up">
        <h3 class="text-sm font-medium text-base-content/70">Measurement unit</h3>

        <!-- Quick unit buttons -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm transition-all duration-150"
            [class.btn-primary]="measurementUnit() === 'KG'"
            [class.btn-outline]="measurementUnit() !== 'KG'"
            (click)="onUnitChange('KG')"
          >
            Kilograms (kg)
          </button>
          <button
            type="button"
            class="btn btn-sm transition-all duration-150"
            [class.btn-primary]="measurementUnit() === 'L'"
            [class.btn-outline]="measurementUnit() !== 'L'"
            (click)="onUnitChange('L')"
          >
            Liters (L)
          </button>
          <button
            type="button"
            class="btn btn-sm btn-ghost transition-all duration-150"
            [class.btn-active]="showAllUnits()"
            (click)="toggleShowAll()"
          >
            Other...
          </button>
        </div>

        <!-- Extended dropdown (shown when "Other" is clicked) -->
        @if (showAllUnits()) {
          <select
            class="select select-bordered select-sm w-full"
            [value]="measurementUnit()"
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
        }

        <p class="text-xs text-base-content/50">
          Fractional sales enabled — customers can buy any amount
        </p>
      </div>
    }
  `,
})
export class MeasurementUnitSelectorComponent {
  // Inputs
  readonly measurementUnit = input<string | null>(null);
  readonly visible = input<boolean>(false);

  // Outputs
  readonly unitChange = output<string>();

  // Internal state
  readonly showAllUnits = signal(false);

  /**
   * Handle unit selection change
   */
  onUnitChange(unit: string): void {
    this.unitChange.emit(unit);
    // Hide dropdown if a quick unit was selected
    if (unit === 'KG' || unit === 'L') {
      this.showAllUnits.set(false);
    }
  }

  /**
   * Toggle showing all units dropdown
   */
  toggleShowAll(): void {
    this.showAllUnits.update((v) => !v);
  }
}
