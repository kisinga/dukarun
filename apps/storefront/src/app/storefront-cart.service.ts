import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import {
  buildStorefrontCartMessage,
  formatCartKes,
  sanitizeCartQuantity,
  storefrontCartCount,
  storefrontCartLineLabel,
  storefrontCartTotal,
  type StorefrontCartLine,
  type StorefrontCartShop,
} from './storefront-cart.models';

const CART_KEY_PREFIX = 'dukarun.storefront.cart:';
const MAX_CART_LINES = 64;

function cartKey(slug: string): string {
  return `${CART_KEY_PREFIX}${slug}`;
}

@Injectable({ providedIn: 'root' })
export class StorefrontCartService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly activeShop = signal<StorefrontCartShop | null>(null);
  private readonly restoredSlug = signal<string | null>(null);

  readonly lines = signal<StorefrontCartLine[]>([]);
  readonly count = computed(() => storefrontCartCount(this.lines()));
  readonly total = computed(() => storefrontCartTotal(this.lines()));
  readonly isEmpty = computed(() => this.lines().length === 0);

  constructor() {
    effect(() => {
      const shop = this.activeShop();
      const lines = this.lines();
      if (!this.isBrowser || !shop || this.restoredSlug() !== shop.slug) return;
      try {
        window.localStorage.setItem(cartKey(shop.slug), JSON.stringify(lines));
      } catch {
        // The cart still works for this page view when storage is unavailable.
      }
    });
  }

  setShop(shop: StorefrontCartShop): void {
    const current = this.activeShop();
    if (current?.slug === shop.slug) {
      this.activeShop.set(shop);
      return;
    }
    this.activeShop.set(shop);
    this.restoredSlug.set(null);
    this.lines.set(this.restore(shop.slug));
    this.restoredSlug.set(shop.slug);
  }

  add(line: StorefrontCartLine, quantity = 1): boolean {
    const shop = this.activeShop();
    if (!shop || line.shopSlug !== shop.slug) return false;
    const amount = sanitizeCartQuantity(quantity);
    const existing = this.lines().find(item => item.variantId === line.variantId);
    if (existing) {
      this.setQuantity(line.variantId, existing.quantity + amount);
      return true;
    }
    if (this.lines().length >= MAX_CART_LINES) return false;
    this.lines.update(lines => [...lines, { ...line, quantity: amount }]);
    return true;
  }

  setQuantity(variantId: string, quantity: number): void {
    const normalized = sanitizeCartQuantity(quantity);
    this.lines.update(lines =>
      lines.map(line => (line.variantId === variantId ? { ...line, quantity: normalized } : line))
    );
  }

  remove(variantId: string): void {
    this.lines.update(lines => lines.filter(line => line.variantId !== variantId));
  }

  clear(): void {
    this.lines.set([]);
  }

  lineLabel(line: Pick<StorefrontCartLine, 'productName' | 'variantName'>): string {
    return storefrontCartLineLabel(line);
  }

  formatKes(amount: number): string {
    return formatCartKes(amount);
  }

  whatsappLink(): string | null {
    const shop = this.activeShop();
    const lines = this.lines();
    if (!shop?.whatsappNumber || lines.length === 0) return null;
    const shopUrl = new URL(
      `/${shop.slug}`,
      `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
    ).toString();
    const message = buildStorefrontCartMessage(shop.name, lines, shopUrl);
    return `https://wa.me/${shop.whatsappNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent(message)}`;
  }

  private restore(slug: string): StorefrontCartLine[] {
    if (!this.isBrowser) return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(cartKey(slug)) ?? '[]') as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((line): line is StorefrontCartLine => this.isCartLine(line, slug))
        .map(line => ({ ...line, quantity: sanitizeCartQuantity(line.quantity) }))
        .slice(0, MAX_CART_LINES);
    } catch {
      return [];
    }
  }

  private isCartLine(value: unknown, slug: string): value is StorefrontCartLine {
    if (!value || typeof value !== 'object') return false;
    const line = value as Partial<StorefrontCartLine>;
    return (
      line.shopSlug === slug &&
      typeof line.productId === 'string' &&
      typeof line.variantId === 'string' &&
      typeof line.productName === 'string' &&
      typeof line.variantName === 'string' &&
      typeof line.price === 'number' &&
      Number.isFinite(line.price) &&
      typeof line.quantity === 'number' &&
      typeof line.productUrl === 'string' &&
      (line.imagePath === null || typeof line.imagePath === 'string')
    );
  }
}
