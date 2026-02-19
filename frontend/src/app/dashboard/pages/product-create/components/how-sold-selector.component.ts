import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HowSoldPreset } from '../types/product-creation.types';

const MEASURED_PRESETS: HowSoldPreset[] = ['by-weight-kg', 'by-volume-litre', 'by-length-m'];

function isMeasured(
  preset: HowSoldPreset | null,
): preset is 'by-weight-kg' | 'by-volume-litre' | 'by-length-m' {
  return preset !== null && MEASURED_PRESETS.includes(preset);
}

/**
 * How Sold Selector
 *
 * Lets the user pick how the item is sold. Clean grid with icons.
 * Single item, Sizes/Packs, or Weight/Volume/Length with a unit dropdown (Kg, Litre, Metres).
 */
@Component({
  selector: 'app-how-sold-selector',
  standalone: true,
  imports: [CommonModule],
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
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="m7.5 4.27 9 5.15M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
            />
          </svg>
          <span class="text-[11px] font-medium">Single item</span>
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
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <span class="text-[11px] font-medium">Sizes / Packs</span>
        </button>

        <!-- Weight / Volume / Length (measured) -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="isMeasured(selected())"
          [class.btn-ghost]="!isMeasured(selected())"
          [class.border-base-300]="!isMeasured(selected())"
          (click)="onMeasuredClick()"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 16h6" />
            <path d="M19 13v6" />
            <path d="M12 15V3" />
            <path d="m5 6 3.5 3.5" />
            <path d="m19 6-3.5 3.5" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <circle cx="12" cy="17" r="4" />
          </svg>
          <span class="text-[11px] font-medium">Weight / Volume / Length</span>
        </button>

        <!-- Unit dropdown (shown when measured is selected) -->
        <div class="flex flex-col justify-end">
          @if (isMeasured(selected())) {
            <select
              class="select select-bordered select-sm w-full"
              [value]="measuredValue()"
              (change)="onMeasuredUnitChange($event)"
            >
              <option value="by-weight-kg">Weight (kg)</option>
              <option value="by-volume-litre">Volume (litre)</option>
              <option value="by-length-m">Length (metres)</option>
            </select>
          }
        </div>
      </div>
    </div>
  `,
})
export class HowSoldSelectorComponent {
  readonly selected = input<HowSoldPreset | null>(null);
  readonly selectedChange = output<HowSoldPreset>();

  protected readonly isMeasured = isMeasured;

  protected measuredValue(): HowSoldPreset {
    const s = this.selected();
    return isMeasured(s) ? s : 'by-weight-kg';
  }

  onSelect(preset: HowSoldPreset): void {
    this.selectedChange.emit(preset);
  }

  onMeasuredClick(): void {
    this.selectedChange.emit(this.measuredValue());
  }

  onMeasuredUnitChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as HowSoldPreset;
    if (MEASURED_PRESETS.includes(value)) {
      this.selectedChange.emit(value);
    }
  }
}
