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
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyService } from '../../../../core/services/currency.service';

export interface QuantityInputData {
  variantId: string;
  currentQuantity: number;
  allowFractionalQuantity: boolean;
  pricePerUnit: number;
  variantName: string;
}

@Component({
  selector: 'app-quantity-input-sheet',
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
             md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[85vh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-box"
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
      <div class="px-6 pb-4 border-b border-base-300">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-lg">Update Quantity</h3>
          <button class="btn btn-ghost btn-sm btn-circle" (click)="close()" aria-label="Close">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="px-6 py-4">
        <!-- Product Info -->
        <div class="bg-base-200 rounded-lg p-4 mb-4">
          <div class="text-sm font-medium text-base-content/80 mb-1">Product</div>
          <div class="font-medium">{{ data()?.variantName || 'Product' }}</div>
          <div class="text-sm text-base-content/60">
            @{{ getFormattedPrice() }} per {{ data()?.variantName || 'unit' }}
          </div>
        </div>

        <!-- Quantity Input -->
        <div class="mb-6">
          <label class="label">
            <span class="label-text font-medium">
              Quantity {{ data()?.allowFractionalQuantity ? '(e.g., 0.5)' : '' }}
            </span>
          </label>

          <div class="relative">
            <input
              type="number"
              class="input input-bordered w-full text-lg text-center"
              [formControl]="quantityControl"
              [step]="data()?.allowFractionalQuantity ? '0.1' : '1'"
              [min]="0.1"
              placeholder="Enter quantity"
              (blur)="validateQuantity()"
            />
            @if (data()?.variantName) {
              <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-base-content/60">
                {{ data()!.variantName }}
              </div>
            }
          </div>

          @if (quantityError()) {
            <div class="text-error text-sm mt-1">{{ quantityError() }}</div>
          }
        </div>

        <!-- Quick Actions -->
        @if (data()?.allowFractionalQuantity) {
          <div class="mb-6">
            <div class="text-sm font-medium text-base-content/80 mb-2">Quick Select</div>
            <div class="grid grid-cols-4 gap-2">
              @for (quickValue of quickValues(); track quickValue) {
                <button
                  class="btn btn-outline btn-sm"
                  [class.btn-primary]="quantityControl.value === quickValue"
                  (click)="setQuantity(quickValue)"
                >
                  {{ quickValue }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Total Preview -->
        <div class="bg-primary/10 rounded-lg p-4 mb-6">
          <div class="flex justify-between items-center">
            <span class="font-medium">Total</span>
            <span class="text-2xl font-bold text-primary">
              {{ getFormattedTotal() }}
            </span>
          </div>
          <div class="text-sm text-base-content/60 mt-1">
            {{ quantityControl.value || 0 }} × {{ getFormattedPrice() }}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" (click)="close()">Cancel</button>
          <button
            class="btn btn-primary flex-1"
            [disabled]="!isValidQuantity()"
            (click)="updateQuantity()"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuantityInputSheetComponent {
  private readonly fb = inject(FormBuilder);
  private readonly currencyService = inject(CurrencyService);

  // Inputs
  isOpen = input<boolean>(false);
  data = input<QuantityInputData | null>(null);

  // Outputs
  quantityUpdated = output<{ variantId: string; quantity: number }>();
  closed = output<void>();

  // Form
  readonly quantityForm: FormGroup;
  readonly quantityControl = this.fb.control(0, [Validators.required, Validators.min(0.1)]);

  // State
  readonly quantityError = signal<string | null>(null);

  // Computed
  readonly quickValues = computed(() => {
    if (!this.data()?.allowFractionalQuantity) return [1, 2, 3, 5];
    return [0.5, 1, 1.5, 2, 2.5, 3, 5];
  });

  constructor() {
    this.quantityForm = this.fb.group({
      quantity: this.quantityControl,
    });

    // Initialize with current quantity when data changes
    effect(() => {
      const data = this.data();
      if (data) {
        this.quantityControl.setValue(data.currentQuantity);
        this.quantityError.set(null);
      }
    });
  }

  /**
   * Validate quantity input
   */
  validateQuantity(): void {
    const value = this.quantityControl.value;

    if (!value || value <= 0) {
      this.quantityError.set('Quantity must be greater than 0');
      return;
    }

    // Check fractional quantity validation (max 1 decimal place)
    if (this.data()?.allowFractionalQuantity) {
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 1) {
        this.quantityError.set('Quantity can have at most 1 decimal place');
        return;
      }
    } else {
      // For non-fractional quantities, ensure it's a whole number
      if (value % 1 !== 0) {
        this.quantityError.set('Quantity must be a whole number');
        return;
      }
    }

    this.quantityError.set(null);
  }

  /**
   * Check if current quantity is valid
   */
  isValidQuantity(): boolean {
    return this.quantityControl.valid && !this.quantityError();
  }

  /**
   * Set quantity to a specific value
   */
  setQuantity(quantity: number): void {
    this.quantityControl.setValue(quantity);
    this.validateQuantity();
  }

  /**
   * Update quantity and emit event
   */
  updateQuantity(): void {
    if (!this.isValidQuantity() || !this.data()) return;

    const quantity = this.quantityControl.value;
    if (quantity === null || quantity === undefined) return;

    this.quantityUpdated.emit({
      variantId: this.data()!.variantId,
      quantity: quantity,
    });
    this.close();
  }

  /**
   * Close the bottom sheet
   */
  close(): void {
    this.closed.emit();
  }

  /**
   * Get formatted price per unit
   */
  getFormattedPrice(): string {
    const data = this.data();
    if (!data) return '0';
    // pricePerUnit is already in cents
    return this.currencyService.format(Math.round(data.pricePerUnit), false);
  }

  /**
   * Get formatted total price
   */
  getFormattedTotal(): string {
    const data = this.data();
    const quantity = this.quantityControl.value || 0;
    if (!data) return '0';

    // pricePerUnit is already in cents, so total is also in cents
    const total = data.pricePerUnit * quantity;
    return this.currencyService.format(Math.round(total), false);
  }
}
