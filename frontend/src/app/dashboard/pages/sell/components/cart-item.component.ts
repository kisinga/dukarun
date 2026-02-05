import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import { ProductLabelComponent } from '../../shared/components/product-label.component';
import {
  PriceModificationService,
  PriceOverrideData,
} from '../services/price-modification.service';
import { QuantityInputData, QuantityInputSheetComponent } from './quantity-input-sheet.component';

/** Facet value for manufacturer/category pill */
export interface CartItemFacetValue {
  name: string;
  facetCode?: string;
  facet?: { code: string };
}

export interface CartItemData {
  variant: {
    id: string;
    name: string;
    productName: string;
    priceWithTax: number;
    customFields?: {
      wholesalePrice?: number;
      allowFractionalQuantity?: boolean;
    };
  };
  quantity: number;
  subtotal: number;
  customLinePrice?: number;
  priceOverrideReason?: string;
  facetValues?: CartItemFacetValue[];
}

@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [CommonModule, ProductLabelComponent, QuantityInputSheetComponent],
  template: `
    <div class="card bg-base-100 shadow-sm border border-base-300">
      <div class="card-body p-2">
        <!-- Flex container that wraps on small screens -->
        <div class="flex items-center gap-2 text-sm flex-wrap sm:flex-nowrap">
          <!-- First Line: Product Info + Remove (on small screens) -->
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <!-- Remove Button -->
            <button
              class="btn btn-circle btn-ghost btn-xs flex-shrink-0 text-error hover:bg-error/10"
              (click)="removeItem.emit(item().variant.id)"
              aria-label="Remove item"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
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

            <!-- Product Info -->
            <div class="flex-1 min-w-0">
              <app-product-label
                [productName]="item().variant.productName"
                [facetValues]="item().facetValues ?? []"
              />
              @if (item().variant.name !== item().variant.productName) {
                <div class="text-xs text-base-content/60 leading-tight truncate">
                  {{ item().variant.name }}
                </div>
              }
            </div>
          </div>

          <!-- Second Line: All Controls (on small screens) -->
          <div class="flex items-center gap-2 flex-1 sm:flex-none">
            <!-- Quantity Controls -->
            @if (allowsFractionalQuantity()) {
              <!-- Fractional Quantity Input -->
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  class="btn btn-outline btn-xs"
                  (click)="openQuantitySheet()"
                  aria-label="Edit quantity"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {{ item().quantity }}{{ getQuantityUnit() }}
                </button>
              </div>
            } @else {
              <!-- Standard Quantity Controls -->
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  class="btn btn-square btn-xs"
                  (click)="decreaseQuantity()"
                  [disabled]="item().quantity <= 1"
                  aria-label="Decrease quantity"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M20 12H4"
                    />
                  </svg>
                </button>
                <span class="w-8 text-center font-semibold">{{ item().quantity }}</span>
                <button
                  class="btn btn-square btn-xs"
                  (click)="increaseQuantity()"
                  aria-label="Increase quantity"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>
            }

            <!-- Price Adjustment Controls -->
            @if (canOverridePrices()) {
              <div class="flex items-center gap-1 flex-shrink-0 ml-auto">
                <button
                  class="btn btn-square btn-xs btn-ghost"
                  (click)="decreasePrice()"
                  aria-label="Decrease price by 3%"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <div class="text-center min-w-[4rem]">
                  <div
                    class="text-lg font-bold text-primary"
                    [class.text-warning]="isPriceOverridden()"
                    [class.text-error]="isBelowWholesalePrice()"
                  >
                    {{ getFormattedLinePrice() }}
                  </div>
                  <div class="text-xs text-base-content/50">@{{ getFormattedPerItemPrice() }}</div>
                  @if (isBelowWholesalePrice()) {
                    <div class="text-xs text-error font-medium">Below wholesale price</div>
                  }
                </div>
                <button
                  class="btn btn-square btn-xs btn-ghost"
                  (click)="increasePrice()"
                  aria-label="Increase price by 3%"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
              </div>
            } @else {
              <!-- Display Price Only (No Adjustment Controls) -->
              <div class="text-center min-w-[4rem] flex-shrink-0 ml-auto">
                <div class="text-lg font-bold text-primary">
                  {{ getFormattedLinePrice() }}
                </div>
                <div class="text-xs text-base-content/50">@{{ getFormattedPerItemPrice() }}</div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Quantity Input Sheet -->
    <app-quantity-input-sheet
      [isOpen]="quantitySheetOpen()"
      [data]="quantityInputData()"
      (quantityUpdated)="onQuantityUpdated($event)"
      (closed)="closeQuantitySheet()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartItemComponent {
  // Inputs
  item = input.required<CartItemData>();
  canOverridePrices = input.required<boolean>();

  // Outputs
  quantityChange = output<{ variantId: string; quantity: number }>();
  priceChange = output<PriceOverrideData>();
  removeItem = output<string>();

  // Services
  currencyService = inject(CurrencyService);
  priceModificationService = inject(PriceModificationService);

  // State
  readonly quantitySheetOpen = signal<boolean>(false);

  // Computed
  isPriceOverridden = computed(() => this.item().customLinePrice !== undefined);

  allowsFractionalQuantity = computed(
    () => this.item().variant.customFields?.allowFractionalQuantity || false,
  );

  isBelowWholesalePrice = computed(() => {
    const wholesalePrice = this.item().variant.customFields?.wholesalePrice;
    if (!wholesalePrice || !this.item().customLinePrice) return false;
    return this.item().customLinePrice! < wholesalePrice;
  });

  quantityInputData = computed((): QuantityInputData | null => {
    const item = this.item();
    if (!item) return null;

    return {
      variantId: item.variant.id,
      currentQuantity: item.quantity,
      allowFractionalQuantity: item.variant.customFields?.allowFractionalQuantity || false,
      pricePerUnit: item.variant.priceWithTax,
      variantName: item.variant.name,
    };
  });

  onPriceChange(data: PriceOverrideData): void {
    this.priceChange.emit(data);
  }

  increaseQuantity(): void {
    this.quantityChange.emit({
      variantId: this.item().variant.id,
      quantity: this.item().quantity + 1,
    });

    // Reset custom line price when quantity changes
    if (this.item().customLinePrice !== undefined) {
      // Clear undo/redo stacks when quantity changes
      const variantId = this.item().variant.id;
      this.priceModificationService.clearStacks(variantId);

      this.priceChange.emit({
        variantId,
        customLinePrice: undefined,
        reason: 'Quantity changed - reset price',
      });
    }
  }

  decreaseQuantity(): void {
    if (this.item().quantity > 1) {
      this.quantityChange.emit({
        variantId: this.item().variant.id,
        quantity: this.item().quantity - 1,
      });

      // Reset custom line price when quantity changes
      if (this.item().customLinePrice !== undefined) {
        // Clear undo/redo stacks when quantity changes
        const variantId = this.item().variant.id;
        this.priceModificationService.clearStacks(variantId);

        this.priceChange.emit({
          variantId,
          customLinePrice: undefined,
          reason: 'Quantity changed - reset price',
        });
      }
    }
  }

  increasePrice(): void {
    if (!this.canOverridePrices()) return;

    const variantId = this.item().variant.id;
    // Get current line total in cents (already in cents)
    const currentLineTotalCents = this.item().customLinePrice || Math.round(this.item().subtotal);

    const result = this.priceModificationService.increasePrice(
      variantId,
      currentLineTotalCents,
      'line', // Line price context for cart
    );

    // If result is null, stack is at maximum (10 steps) and action was declined
    if (!result) return;

    this.priceChange.emit({
      variantId,
      customLinePrice: result.newPrice,
      reason: result.reason,
    });
  }

  decreasePrice(): void {
    if (!this.canOverridePrices()) return;

    const variantId = this.item().variant.id;
    // Get current line total in cents (already in cents)
    const currentLineTotalCents = this.item().customLinePrice || Math.round(this.item().subtotal);
    const wholesalePrice = this.item().variant.customFields?.wholesalePrice ?? 0;

    const result = this.priceModificationService.decreasePrice(
      variantId,
      currentLineTotalCents,
      this.item().quantity,
      wholesalePrice,
      'line', // Line price context for cart
    );

    // If result is null, stack is at maximum (10 steps) and action was declined
    if (!result) return;

    this.priceChange.emit({
      variantId,
      customLinePrice: result.newPrice,
      reason: result.reason,
    });
  }

  getFormattedLinePrice(): string {
    // If custom line price exists (in cents), use it directly
    if (this.item().customLinePrice !== undefined) {
      return this.currencyService.format(this.item().customLinePrice!, false);
    }
    // Otherwise, use the calculated subtotal (already in cents)
    return this.currencyService.format(Math.round(this.item().subtotal), false);
  }

  getFormattedPerItemPrice(): string {
    // If custom line price exists, calculate per-item price in cents
    if (this.item().customLinePrice !== undefined) {
      // customLinePrice is in cents, divide by quantity to get per-item price in cents
      return this.currencyService.format(
        Math.round(this.item().customLinePrice! / this.item().quantity),
        false,
      );
    }
    // Otherwise, use the original variant price (already in cents from Vendure)
    return this.currencyService.format(this.item().variant.priceWithTax, false);
  }

  getFormattedBasePrice(): string {
    // Always show the original base price (already in cents from Vendure)
    return this.currencyService.format(this.item().variant.priceWithTax, false);
  }

  // ============================================================================
  // FRACTIONAL QUANTITY METHODS
  // ============================================================================

  /**
   * Open quantity input sheet for fractional quantities
   */
  openQuantitySheet(): void {
    this.quantitySheetOpen.set(true);
  }

  /**
   * Close quantity input sheet
   */
  closeQuantitySheet(): void {
    this.quantitySheetOpen.set(false);
  }

  /**
   * Handle quantity update from sheet
   */
  onQuantityUpdated(data: { variantId: string; quantity: number }): void {
    this.quantityChange.emit(data);
  }

  /**
   * Get quantity unit for display
   */
  getQuantityUnit(): string {
    const unit = this.item().variant.name;
    return unit ? ` ${unit}` : '';
  }
}
