import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HowSoldPreset } from '../types/product-creation.types';

/**
 * How Sold Selector
 *
 * Lets the user pick how the item is sold. Clean grid with icons.
 * Focused on the 4 preset options only.
 */
@Component({
  selector: 'app-how-sold-selector',
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

        <!-- By weight -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'by-weight-kg'"
          [class.btn-ghost]="selected() !== 'by-weight-kg'"
          [class.border-base-300]="selected() !== 'by-weight-kg'"
          (click)="onSelect('by-weight-kg')"
        >
          <!-- Scale/weight icon -->
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
          <span class="text-[11px] font-medium">Weight / Volume</span>
        </button>

        <!-- By volume -->
        <button
          type="button"
          class="btn btn-sm h-auto py-2 flex-col gap-0.5 transition-all duration-200"
          [class.btn-primary]="selected() === 'by-volume-litre'"
          [class.btn-ghost]="selected() !== 'by-volume-litre'"
          [class.border-base-300]="selected() !== 'by-volume-litre'"
          (click)="onSelect('by-volume-litre')"
        >
          <!-- Beaker/liquid icon -->
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4.5 3h15" />
            <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
            <path d="M6 14h12" />
          </svg>
          <span class="text-[11px] font-medium">Custom</span>
        </button>
      </div>
    </div>
  `,
})
export class HowSoldSelectorComponent {
  readonly selected = input<HowSoldPreset | null>(null);
  readonly selectedChange = output<HowSoldPreset>();

  onSelect(preset: HowSoldPreset): void {
    this.selectedChange.emit(preset);
  }
}
