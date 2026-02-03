import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProductVariant } from '../../../../core/services/product/product-search.service';
import { CartItemComponent } from './cart-item.component';
import { PriceOverrideData } from '../services/price-modification.service';

export interface CartItem {
  variant: ProductVariant;
  quantity: number;
  subtotal: number;
  customLinePrice?: number; // Line price in cents
  priceOverrideReason?: string; // Reason code
}

/**
 * Flexible cart component with display modes
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, CartItemComponent],
  template: `
    <div [class]="containerClasses()">
      <!-- Cart Header with Clear Button -->
      @if (items().length > 0) {
        <div class="flex items-center justify-between mb-2 md:mb-3 p-2 -m-2 md:p-0 md:m-0">
          <h3 class="font-semibold pl-2 text-sm md:text-base">Cart Items</h3>
          <button
            class="btn btn-ghost btn-sm text-error hover:bg-error/10"
            (click)="onClearCart()"
            title="Clear all items"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Clear Cart
          </button>
        </div>
      }

      <!-- Empty State -->
      @if (items().length === 0) {
        <div class="flex flex-col items-center justify-center py-6 opacity-60">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-12 w-12 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p class="text-sm text-base-content/60">Cart is empty</p>
        </div>
      }

      <!-- Cart Items -->
      @if (items().length > 0) {
        <div
          class="space-y-3"
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
