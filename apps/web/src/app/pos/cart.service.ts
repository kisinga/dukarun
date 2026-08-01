import { Injectable, computed, signal } from '@angular/core';
import type { Product, SaleLineInput } from './pos.service';

export interface CartLine {
  product: Product;
  quantity: number;
  unitPrice: number; // cents
  customPrice: number | null; // cents; null = no override
  overrideReason: string;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly lines = signal<CartLine[]>([]);
  /** null = Walk-in customer (sent as null customer_id to the RPCs). */
  readonly customerId = signal<string | null>(null);
  readonly customerName = signal('Walk-in');
  /** Set when editing an existing proforma. */
  readonly draftId = signal<string | null>(null);

  readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + this.lineTotal(line), 0)
  );
  readonly isEmpty = computed(() => this.lines().length === 0);

  /** Mirrors the backend's per-line round(qty * price). */
  lineTotal(line: CartLine): number {
    return Math.round(line.quantity * (line.customPrice ?? line.unitPrice));
  }

  addProduct(product: Product): void {
    const existing = this.lines().find(l => l.product.id === product.id);
    if (existing) {
      this.setQuantity(product.id, existing.quantity + this.quantityStep(product));
    } else {
      this.lines.update(lines => [
        ...lines,
        {
          product,
          quantity: this.quantityStep(product),
          unitPrice: product.price,
          customPrice: null,
          overrideReason: '',
        },
      ]);
    }
  }

  quantityStep(product: Product): number {
    return product.allow_fractional ? 0.5 : 1;
  }

  setQuantity(productId: string, quantity: number): void {
    const line = this.lines().find(l => l.product.id === productId);
    if (!line) return;
    const normalized = line.product.allow_fractional ? quantity : Math.round(quantity);
    if (!(normalized > 0)) {
      this.removeLine(productId);
      return;
    }
    this.patch(productId, { quantity: normalized });
  }

  setCustomPrice(productId: string, priceCents: number | null, reason: string): void {
    this.patch(productId, { customPrice: priceCents, overrideReason: reason });
  }

  removeLine(productId: string): void {
    this.lines.update(lines => lines.filter(l => l.product.id !== productId));
  }

  setCustomer(id: string | null, name: string): void {
    this.customerId.set(id);
    this.customerName.set(name);
  }

  toSaleLines(): SaleLineInput[] {
    return this.lines().map(l => ({
      product_id: l.product.id,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      ...(l.customPrice !== null && l.customPrice !== l.unitPrice
        ? { custom_price: l.customPrice, override_reason: l.overrideReason }
        : {}),
    }));
  }

  clear(): void {
    this.lines.set([]);
    this.customerId.set(null);
    this.customerName.set('Walk-in');
    this.draftId.set(null);
  }

  private patch(productId: string, changes: Partial<CartLine>): void {
    this.lines.update(lines =>
      lines.map(l => (l.product.id === productId ? { ...l, ...changes } : l))
    );
  }
}
