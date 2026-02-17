import { Injectable, computed, inject, signal } from '@angular/core';
import { ApolloService } from './apollo.service';
import { AuthService } from './auth.service';
import { AppCacheService } from './cache/app-cache.service';
import { CompanyService } from './company.service';
import { ProductVariant } from './product/product-search.service';

/** Facet value for manufacturer/category pill on cart items */
export interface CartItemFacetValue {
  name: string;
  facetCode?: string;
  facet?: { code: string };
}

/**
 * Cart item interface - aligned with cart component
 */
export interface CartItem {
  variant: ProductVariant;
  quantity: number;
  subtotal: number;
  customLinePrice?: number; // Line price in cents
  priceOverrideReason?: string; // Reason code
  /** Product-level facet values (manufacturer, category) for pill display */
  facetValues?: CartItemFacetValue[];
}

/**
 * Cart summary interface
 */
export interface CartSummary {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

/**
 * TODO: Implement admin-api order management
 * The shop-api cart operations (activeOrder, addItemToOrder, removeOrderLine)
 * are not available in admin-api. For admin panel, we should use:
 * - createDraftOrder
 * - addItemToDraftOrder
 * - removeDraftOrderLine
 *
 * For now, this service provides a stub implementation
 */

/**
 * Scoped service for managing shopping cart
 * This demonstrates a service that depends on authentication
 */
@Injectable({
  providedIn: 'root',
})
export class CartService {
  private readonly authService = inject(AuthService);
  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);
  private readonly companyService = inject(CompanyService);

  // Cart state signals
  private readonly cartItemsSignal = signal<CartItem[]>([]);
  private readonly isLoadingSignal = signal<boolean>(false);
  /** True while persisted cart is being loaded from cache. Set false when load completes (or no channel). */
  private readonly isLoadingFromCacheSignal = signal<boolean>(false);

  // Public computed signals
  readonly cartItems = this.cartItemsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  /** True from when loadCartFromCache() is called until the cache read finishes. Use to show loading UI until cart is hydrated. */
  readonly isLoadingFromCache = this.isLoadingFromCacheSignal.asReadonly();
  readonly totalItems = computed(() =>
    this.cartItemsSignal().reduce((sum, item) => sum + item.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this.cartItemsSignal().reduce((sum, item) => sum + item.subtotal, 0),
  );
  readonly isEmpty = computed(() => this.cartItemsSignal().length === 0);

  /**
   * Fetch active cart/order
   * TODO: Implement using admin-api draft orders
   */
  async fetchCart(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      console.warn('Cannot fetch cart: user not authenticated');
      return;
    }

    this.isLoadingSignal.set(true);

    try {
      // TODO: Implement with createDraftOrder or fetch existing draft orders
      console.log('Cart fetching not yet implemented for admin-api');
      this.cartItemsSignal.set([]);
    } catch (error) {
      console.error('Failed to fetch cart:', error);
      this.cartItemsSignal.set([]);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Add item to cart
   * TODO: Implement using admin-api draft orders
   */
  async addToCart(productVariantId: string, quantity: number): Promise<boolean> {
    if (!this.authService.isAuthenticated()) {
      console.warn('Cannot add to cart: user not authenticated');
      return false;
    }

    this.isLoadingSignal.set(true);

    try {
      // TODO: Implement with addItemToDraftOrder
      console.log('Add to cart not yet implemented for admin-api', { productVariantId, quantity });
      return false;
    } catch (error) {
      console.error('Failed to add to cart:', error);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Remove item from cart
   * TODO: Implement using admin-api draft orders
   */
  async removeFromCart(orderLineId: string): Promise<boolean> {
    if (!this.authService.isAuthenticated()) {
      console.warn('Cannot remove from cart: user not authenticated');
      return false;
    }

    this.isLoadingSignal.set(true);

    try {
      // TODO: Implement with removeDraftOrderLine
      console.log('Remove from cart not yet implemented for admin-api', { orderLineId });
      return false;
    } catch (error) {
      console.error('Failed to remove from cart:', error);
      return false;
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Clear entire cart
   */
  clearCart(): void {
    this.cartItemsSignal.set([]);
    this.persistCart();
  }

  /**
   * Load cart from cache (async). Call this when entering a screen that needs the cart (e.g. sell page).
   * isLoadingFromCache is true from this call until the cache read completes — use it to show loading state.
   */
  loadCartFromCache(): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) {
      console.log('No active channel, skipping cart load');
      return;
    }

    this.isLoadingFromCacheSignal.set(true);
    const scope = `channel:${channelId}` as const;
    this.appCache.getKV<CartItem[]>(scope, 'items').then((cachedCart) => {
      if (cachedCart?.length !== undefined) {
        this.cartItemsSignal.set(cachedCart);
        console.log(`📦 Loaded cart from cache: ${cachedCart.length} items`);
      }
      this.isLoadingFromCacheSignal.set(false);
    });
  }

  /**
   * Persist cart to cache
   */
  private persistCart(): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) return;

    const scope = `channel:${channelId}` as const;
    this.appCache.setKV(scope, 'items', this.cartItemsSignal());
  }

  /**
   * Get cart summary
   */
  getCartSummary(): CartSummary {
    const items = this.cartItemsSignal();
    const subtotal = this.subtotal();
    const shipping = 0; // Calculate based on your business logic
    const tax = 0; // Calculate based on your business logic
    const total = subtotal + shipping + tax;

    return {
      items,
      totalItems: this.totalItems(),
      subtotal,
      shipping,
      tax,
      total,
    };
  }

  /**
   * Add item locally (for POS quick add)
   * This is a local-only operation for the POS system
   */
  addItemLocal(
    variant: ProductVariant,
    quantity: number,
    facetValues?: CartItemFacetValue[],
  ): void {
    const items = this.cartItemsSignal();
    const existingIndex = items.findIndex((item) => item.variant.id === variant.id);

    const newItems =
      existingIndex >= 0
        ? items.map((item, i) =>
            i === existingIndex
              ? {
                  ...item,
                  quantity: item.quantity + quantity,
                  subtotal: (item.quantity + quantity) * variant.priceWithTax,
                }
              : item,
          )
        : [
            ...items,
            {
              variant,
              quantity,
              subtotal: quantity * variant.priceWithTax,
              facetValues: facetValues ?? [],
            },
          ];

    this.cartItemsSignal.set(newItems);
    this.persistCart();
  }

  /**
   * Update item quantity locally
   */
  updateItemQuantityLocal(variantId: string, quantity: number): void {
    const items = this.cartItemsSignal();
    const item = items.find((i) => i.variant.id === variantId);
    if (!item) return;
    if (quantity <= 0) {
      this.removeItemLocal(variantId);
      return;
    }
    const newItems = items.map((i) =>
      i.variant.id === variantId
        ? { ...i, quantity, subtotal: quantity * i.variant.priceWithTax }
        : i,
    );
    this.cartItemsSignal.set(newItems);
    this.persistCart();
  }

  /**
   * Remove item locally
   */
  removeItemLocal(variantId: string): void {
    const items = this.cartItemsSignal();
    this.cartItemsSignal.set(items.filter((item) => item.variant.id !== variantId));
    this.persistCart();
  }
}
