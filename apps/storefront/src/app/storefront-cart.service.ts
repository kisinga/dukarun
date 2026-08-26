import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';

const CART_KEY_PREFIX = 'dukarun.storefront.cart:';
const MAX_CART_LINES = 64;

export interface StorefrontCartLine {
  shopSlug: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  price: number;
  quantity: number;
  imagePath: string | null;
  productUrl: string;
}

export interface StorefrontCartShop {
  slug: string;
  name: string;
  whatsappNumber: string | null;
}

function cartKey(slug: string): string {
  return `${CART_KEY_PREFIX}${slug}`;
}

function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

function lineLabel(line: Pick<StorefrontCartLine, 'productName' | 'variantName'>): string {
  return !line.variantName || line.variantName === 'Default'
    ? line.productName
    : `${line.productName} · ${line.variantName}`;
}

function sanitizeQuantity(quantity: number): number {
  return Math.max(1, Math.min(999, Math.round(quantity)));
}

export function storefrontCartTotal(lines: readonly StorefrontCartLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.price * line.quantity), 0);
}

export function storefrontCartCount(lines: readonly StorefrontCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function buildStorefrontCartMessage(
  shopName: string,
  lines: readonly StorefrontCartLine[],
  shopUrl: string
): string {
  const summary = lines
    .map((line, index) => {
      const total = Math.round(line.price * line.quantity);
      return `${index + 1}. ${lineLabel(line)}\n   Qty: ${line.quantity}\n   Price: ${formatKes(line.price)} each\n   Line: ${formatKes(total)}`;
    })
    .join('\n\n');
  return [
    `Hello ${shopName}! I'd like to order:`,
    '',
    summary,
    '',
    `Estimated total: ${formatKes(storefrontCartTotal(lines))}`,
    '',
    `Catalogue: ${shopUrl}`,
  ].join('\n');
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
    const amount = sanitizeQuantity(quantity);
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
    const normalized = sanitizeQuantity(quantity);
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
    return lineLabel(line);
  }

  formatKes(amount: number): string {
    return formatKes(amount);
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
        .map(line => ({ ...line, quantity: sanitizeQuantity(line.quantity) }))
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
