import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { offlineDb, offlineScopeKey, type PersistedCart } from './offline/offline-db';
import { variantLabel, type SaleLineInput, type Variant } from './pos.service';
import { LocationContextService } from '../core/location-context.service';

export interface CartLine {
  variant: Variant;
  quantity: number;
  unitPrice: number; // shillings
  customPrice: number | null; // shillings; null = no override
  overrideReason: string;
}

/**
 * One order is one payment, receipt, stock movement and accounting event.
 * Keep that unit of work bounded; cashiers start another order after this.
 * The database enforces the same authoritative limit.
 */
export const MAX_SALE_LINES = 128;

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
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

  /** Scope that has completed its IndexedDB restore. */
  private readonly restoredScope = signal<string | null>(null);
  private readonly activeScope = signal<string | null>(null);

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      const key = identity && locationId ? offlineScopeKey(identity, locationId) : null;
      untracked(() => void this.switchScope(key));
    });
    // Persist the in-progress cart on every change so a refresh or a
    // mid-sale connectivity drop doesn't lose it.
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      if (!identity || !locationId) return;
      const key = offlineScopeKey(identity, locationId);
      if (this.restoredScope() !== key || this.activeScope() !== key) return;
      const persisted: PersistedCart = {
        key,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        lines: this.lines(),
        customerId: this.customerId(),
        customerName: this.customerName(),
        draftId: this.draftId(),
      };
      void offlineDb().then(db => db.put('cart', persisted));
    });
  }

  private async switchScope(key: string | null): Promise<void> {
    if (this.activeScope() === key) return;
    this.activeScope.set(key);
    this.restoredScope.set(null);
    this.reset();
    if (!key) return;
    try {
      const db = await offlineDb();
      const saved = await db.get('cart', key);
      if (saved && this.activeScope() === key) {
        // Merge instead of overwriting: lines added between scope activation
        // and this restore completing would otherwise be clobbered.
        const merged = saved.lines.map(line => ({ ...line }));
        for (const line of this.lines()) {
          const existing = merged.find(l => l.variant.variant_id === line.variant.variant_id);
          if (existing) {
            existing.quantity += line.quantity;
          } else {
            merged.push({ ...line });
          }
        }
        this.lines.set(merged);
        // Only restore customer/draft if the cashier hasn't picked one yet.
        if (this.customerId() === null && this.customerName() === 'Walk-in') {
          this.customerId.set(saved.customerId);
          this.customerName.set(saved.customerName);
        }
        if (this.draftId() === null) this.draftId.set(saved.draftId);
      }
    } catch {
      // Persistence is best-effort; an empty cart beats a crashed app.
    } finally {
      if (this.activeScope() === key) this.restoredScope.set(key);
    }
  }

  /** Mirrors the backend's per-line round(qty * price). */
  lineTotal(line: CartLine): number {
    return Math.round(line.quantity * (line.customPrice ?? line.unitPrice));
  }

  addVariant(variant: Variant): boolean {
    const existing = this.lines().find(l => l.variant.variant_id === variant.variant_id);
    if (existing) {
      this.setQuantity(variant.variant_id!, existing.quantity + this.quantityStep(variant));
      return true;
    }
    if (this.lines().length >= MAX_SALE_LINES) return false;
    this.lines.update(lines => [
      ...lines,
      {
        variant,
        quantity: this.quantityStep(variant),
        unitPrice: variant.price ?? 0,
        customPrice: null,
        overrideReason: '',
      },
    ]);
    return true;
  }

  quantityStep(variant: Variant): number {
    return variant.allow_fractional ? 0.5 : 1;
  }

  setQuantity(variantId: string, quantity: number): void {
    const line = this.lines().find(l => l.variant.variant_id === variantId);
    if (!line) return;
    const normalized = line.variant.allow_fractional ? quantity : Math.round(quantity);
    if (!(normalized > 0)) {
      this.removeLine(variantId);
      return;
    }
    this.patch(variantId, { quantity: normalized });
  }

  setCustomPrice(variantId: string, priceAmount: number | null, reason: string): boolean {
    const line = this.lines().find(item => item.variant.variant_id === variantId);
    if (!line) return false;
    if (
      priceAmount !== null &&
      (!(priceAmount > 0) || priceAmount < (line.variant.wholesale_price ?? 0))
    ) {
      return false;
    }
    this.patch(variantId, { customPrice: priceAmount, overrideReason: reason });
    return true;
  }

  removeLine(variantId: string): void {
    this.lines.update(lines => lines.filter(l => l.variant.variant_id !== variantId));
  }

  setCustomer(id: string | null, name: string): void {
    this.customerId.set(id);
    this.customerName.set(name);
  }

  lineLabel(line: CartLine): string {
    return variantLabel(line.variant);
  }

  toSaleLines(): SaleLineInput[] {
    return this.lines().map(l => ({
      variant_id: l.variant.variant_id!,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      ...(l.customPrice !== null && l.customPrice !== l.unitPrice
        ? { custom_price: l.customPrice, override_reason: l.overrideReason }
        : {}),
    }));
  }

  clear(): void {
    this.reset();
  }

  private reset(): void {
    this.lines.set([]);
    this.customerId.set(null);
    this.customerName.set('Walk-in');
    this.draftId.set(null);
  }

  private patch(variantId: string, changes: Partial<CartLine>): void {
    this.lines.update(lines =>
      lines.map(l => (l.variant.variant_id === variantId ? { ...l, ...changes } : l))
    );
  }
}
