import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyService } from '../../../../core/services/currency.service';

/** All price amounts are in currency units (e.g. sh), not cents. */
export interface PriceEditData {
  variantId: string;
  productName: string;
  variantName: string;
  /** Current line total in currency units (prefills the input). */
  currentLinePrice: number;
  /** Base unit price in currency units. */
  basePrice: number;
  quantity: number;
  /** Wholesale unit price in currency units, if applicable. */
  wholesalePrice?: number;
}

@Component({
  selector: 'app-price-edit-sheet',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/50 z-40 transition-opacity"
      [class.opacity-0]="!isOpen()"
      [class.pointer-events-none]="!isOpen()"
      (click)="close()"
    ></div>

    <!-- Bottom sheet on mobile; centered modal on desktop -->
    <div
      class="fixed left-0 right-0 z-50 bg-base-100 shadow-2xl transform transition-all duration-300 ease-out
             bottom-0 rounded-t-2xl max-h-[90vh] overflow-y-auto
             md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-box"
      [class.translate-y-full]="!isOpen()"
      [class.translate-y-0]="isOpen()"
      [class.opacity-0]="!isOpen()"
      [class.pointer-events-none]="!isOpen()"
    >
      <!-- Handle (mobile only) -->
      <div class="flex justify-center pt-3 pb-2 md:hidden">
        <div class="w-12 h-1 bg-base-300 rounded-full"></div>
      </div>

      <!-- Header -->
      <div class="px-5 pb-3 border-b border-base-300">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-base">Edit Line Price</h3>
          <button
            class="btn btn-sm btn-circle btn-outline border-base-300"
            (click)="close()"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content — pb-20 ensures action buttons clear mobile bottom nav -->
      <div class="px-5 py-4 pb-24 md:pb-4">
        <!-- Product context -->
        <div class="bg-base-200 rounded-lg p-3 mb-4 text-sm">
          <div class="font-medium truncate">{{ data()?.productName }}</div>
          @if (data()?.variantName !== data()?.productName) {
            <div class="text-base-content/60 truncate">{{ data()?.variantName }}</div>
          }
          <div class="text-base-content/60 mt-1">
            {{ data()?.quantity }} × {{ getFormattedBaseUnitPrice() }}
          </div>
        </div>

        <!-- Price Input -->
        <div class="mb-4">
          <label class="text-sm font-medium text-base-content/70 mb-1.5 block"
            >Total line price</label
          >
          <input
            type="text"
            inputmode="decimal"
            class="input input-bordered w-full text-xl font-bold text-center"
            [formControl]="priceControl"
            placeholder="0.00"
            (keydown.enter)="submit()"
            (keydown.escape)="close()"
          />
          @if (priceError()) {
            <div class="text-error text-xs mt-1">{{ priceError() }}</div>
          }
          @if (isAboveBase()) {
            <div class="text-info text-xs mt-1">Above base price</div>
          }
          @if (isBelowWholesale()) {
            <div class="text-error text-xs mt-1 font-medium">Below wholesale price</div>
          }
        </div>

        <!-- Computed per-item price -->
        <div class="bg-primary/10 rounded-lg p-3 mb-4">
          <div class="flex justify-between items-center text-sm">
            <span class="text-base-content/70">Per item</span>
            <span class="font-bold text-primary">@{{ getFormattedPerItem() }}</span>
          </div>
        </div>

        <!-- Quick presets: base price, and reset -->
        <div class="flex gap-2 mb-4">
          <button class="btn btn-outline btn-sm flex-1" (click)="resetToBase()">
            Reset to base
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" (click)="close()">Cancel</button>
          <button class="btn btn-primary flex-1" [disabled]="!isValid()" (click)="submit()">
            Update Price
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceEditSheetComponent {
  private readonly fb = inject(FormBuilder);
  private readonly currencyService = inject(CurrencyService);

  readonly isOpen = input<boolean>(false);
  readonly data = input<PriceEditData | null>(null);

  /** Emits new line total in currency units (sh). Parent converts to cents if needed. */
  readonly priceUpdated = output<{ variantId: string; newLinePrice: number }>();
  readonly closed = output<void>();

  readonly priceControl = this.fb.control('', [Validators.required]);
  readonly priceError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const d = this.data();
      const open = this.isOpen();
      if (d && open) {
        // Prefill with the currently shown (line) price in currency units
        const value = Number.isFinite(d.currentLinePrice) ? d.currentLinePrice : 0;
        this.priceControl.setValue(value.toFixed(2));
        this.priceError.set(null);
      }
    });
  }

  isValid(): boolean {
    const sh = this.parsePrice();
    return sh !== null && sh > 0;
  }

  isAboveBase(): boolean {
    const sh = this.parsePrice();
    const d = this.data();
    if (!sh || !d) return false;
    return sh > d.basePrice * d.quantity;
  }

  isBelowWholesale(): boolean {
    const sh = this.parsePrice();
    const d = this.data();
    if (!sh || !d || d.wholesalePrice == null) return false;
    return sh < d.wholesalePrice * d.quantity;
  }

  getFormattedBaseUnitPrice(): string {
    const d = this.data();
    if (!d) return '';
    return this.currencyService.format(Math.round(d.basePrice * 100), false);
  }

  getFormattedPerItem(): string {
    const sh = this.parsePrice();
    const d = this.data();
    if (!sh || !d || d.quantity === 0) return '–';
    const perItemSh = sh / d.quantity;
    return this.currencyService.format(Math.round(perItemSh * 100), false);
  }

  resetToBase(): void {
    const d = this.data();
    if (!d) return;
    const lineTotal = d.basePrice * d.quantity;
    this.priceControl.setValue(lineTotal.toFixed(2));
    this.priceError.set(null);
  }

  submit(): void {
    const sh = this.parsePrice();
    const d = this.data();
    if (!sh || !d) {
      this.priceError.set('Enter a valid price');
      return;
    }
    if (sh <= 0) {
      this.priceError.set('Price must be greater than 0');
      return;
    }
    this.priceUpdated.emit({ variantId: d.variantId, newLinePrice: sh });
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  /** Parse input value as price in currency units (sh). */
  private parsePrice(): number | null {
    const raw = this.priceControl.value?.toString().trim();
    if (!raw) return null;
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return null;
    return num;
  }
}
