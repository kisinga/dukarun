import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ProductVariant } from '@dukarun/product';
import { PriceOverrideData } from '../services/price-modification.service';
import { CartItemComponent } from './cart-item.component';

/** Facet value for manufacturer/category pill */
export interface CartItemFacetValue {
  name: string;
  facetCode?: string;
  facet?: { code: string };
}

export interface CartItem {
  variant: ProductVariant;
  quantity: number;
  subtotal: number;
  customLinePrice?: number; // Line price in cents
  priceOverrideReason?: string; // Reason code
  facetValues?: CartItemFacetValue[];
}

/**
 * Flexible cart component with display modes
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, NgIcon, CartItemComponent],
  template: `
    <div [class]="containerClasses()">
      <!-- Cart Header with Clear Button -->
      @if (items().length > 0) {
        <div class="flex items-center justify-between mb-3 md:mb-4">
          <h3 class="font-bold text-base md:text-lg tracking-tight">Cart Items</h3>
          <button
            class="btn btn-ghost btn-sm text-error hover:bg-error/10"
            (click)="onClearCart()"
            title="Clear all items"
          >
            <ng-icon name="heroTrash" size="1rem" class="mr-1" />
            Clear Cart
          </button>
        </div>
      }

      <!-- Empty State -->
      @if (items().length === 0) {
        <div class="flex flex-col items-center justify-center py-8">
          <ng-icon name="heroShoppingCart" size="3rem" class="mb-2 text-base-content/50" />
          <p class="font-semibold text-base-content/80">No items</p>
          <p class="text-sm text-base-content/70 mt-0.5">Cart is empty</p>
        </div>
      }

      <!-- Cart Items -->
      @if (items().length > 0) {
        <div
          class="rounded-lg border border-base-300 bg-base-100 shadow-sm divide-y divide-base-300"
          [class.max-h-[60vh]]="displayMode() === 'modal'"
          [class.overflow-y-auto]="displayMode() === 'modal'"
        >
          @for (item of items(); track item.variant.id) {
            <app-cart-item
              [item]="item"
              [canOverridePrices]="canOverridePrices()"
              (quantityChange)="onQuantityChange($event)"
              (priceChange)="onPriceChange($event)"
              (removeItem)="onRemove($event)"
            />
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  // Inputs
  items = input.required<CartItem[]>();
  canOverridePrices = input.required<boolean>();
  displayMode = input<'inline' | 'modal'>('inline');

  // Outputs
  quantityChange = output<{ variantId: string; quantity: number }>();
  priceChange = output<PriceOverrideData>();
  removeItem = output<string>();
  clearCart = output<void>();

  // Computed
  containerClasses = computed(() =>
    this.displayMode() === 'inline' ? 'cart-inline' : 'cart-modal',
  );

  onQuantityChange(data: { variantId: string; quantity: number }): void {
    this.quantityChange.emit(data);
  }

  onPriceChange(data: PriceOverrideData): void {
    this.priceChange.emit(data);
  }

  onRemove(variantId: string): void {
    this.removeItem.emit(variantId);
  }

  onClearCart(): void {
    this.clearCart.emit();
  }
}
