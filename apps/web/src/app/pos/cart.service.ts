import { sellingUnits, type SellingUnit } from '@dukarun/pack-types';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { offlineDb, offlineScopeKey, type PersistedCart } from './offline/offline-db';
import { variantLabel, type SaleLineInput, type Variant } from './pos.service';
import { LocationContextService } from '../core/location-context.service';

export interface CartLine {
  id?: string;
  packId?: string | null;
  unitName?: string;
  stockUnit?: string;
  unitsPerUnit?: number;
  priceSource?: 'retail' | 'wholesale' | 'pack';
  variant: Variant;
  quantity: number;
  unitPrice: number; // shillings
  customPrice: number | null; // shillings; null = no override
  overrideReason: string;
}

export function cartLineId(line: CartLine): string {
  return line.id ?? line.variant.variant_id!;
}
export function cartStockQuantity(line: CartLine): number {
  return line.quantity * (line.unitsPerUnit ?? 1);
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
  readonly error = signal<string | null>(null);
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
        const merged: CartLine[] = saved.lines.map(line => ({
          ...line,
          id: cartLineId(line),
          unitsPerUnit: line.unitsPerUnit ?? 1,
          unitName: line.unitName ?? line.variant.stock_unit ?? 'item',
          packId: line.packId ?? null,
        }));
        for (const line of this.lines()) {
          const existing = merged.find(l => cartLineId(l) === cartLineId(line));
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
    const unit = sellingUnits(variant).find(
      unit => unit.packId === (variant.selected_pack_id ?? null)
    );
    return unit ? this.addUnit(variant, unit) : false;
  }

  addUnit(variant: Variant, unit: SellingUnit): boolean {
    this.error.set(null);
    this.refreshStock(variant);
    const existing = this.lines().find(
      line =>
        line.variant.variant_id === variant.variant_id &&
        (line.packId ?? null) === unit.packId &&
        line.customPrice === null &&
        line.unitPrice === unit.price &&
        (line.priceSource ?? 'retail') === (unit.packId ? 'pack' : 'retail')
    );
    const amount = unit.packId ? 1 : this.quantityStep(variant);
    if (
      variant.track_inventory &&
      this.stockDemand(variant.variant_id!) + amount * unit.factor > (variant.stock ?? 0)
    ) {
      this.error.set(`Not enough ${unit.stockUnit} available for ${unit.name}.`);
      return false;
    }
    if (existing) {
      return this.setQuantity(cartLineId(existing), existing.quantity + amount);
    }
    if (this.lines().length >= MAX_SALE_LINES) {
      this.error.set(`An order can contain at most ${MAX_SALE_LINES} lines.`);
      return false;
    }
    this.lines.update(lines => [
      ...lines,
      {
        id: crypto.randomUUID(),
        variant,
        packId: unit.packId,
        unitName: unit.name,
        stockUnit: unit.stockUnit,
        unitsPerUnit: unit.factor,
        priceSource: unit.packId ? 'pack' : 'retail',
        quantity: amount,
        unitPrice: unit.price,
        customPrice: null,
        overrideReason: '',
      },
    ]);
    return true;
  }

  stockDemand(variantId: string, exceptLineId?: string): number {
    return this.lines()
      .filter(line => line.variant.variant_id === variantId && cartLineId(line) !== exceptLineId)
      .reduce((sum, line) => sum + cartStockQuantity(line), 0);
  }

  findLine(id: string): CartLine | undefined {
    const exact = this.lines().find(line => cartLineId(line) === id);
    if (exact) return exact;
    const legacy = this.lines().filter(line => line.variant.variant_id === id);
    return legacy.length === 1 ? legacy[0] : undefined;
  }

  changeUnit(id: string, unit: SellingUnit, quantity: number, variant?: Variant): boolean {
    const line = this.findLine(id);
    if (!line) return false;
    const currentVariant = variant ?? line.variant;
    if (currentVariant.variant_id !== line.variant.variant_id) return false;
    const currentUnit = sellingUnits(currentVariant).find(choice => choice.packId === unit.packId);
    if (!currentUnit) {
      this.error.set('This selling unit is no longer available.');
      return false;
    }
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      ((currentUnit.packId || !currentVariant.allow_fractional) && !Number.isInteger(quantity))
    )
      return false;
    this.refreshStock(currentVariant);
    if (
      currentVariant.track_inventory &&
      this.stockDemand(currentVariant.variant_id!, cartLineId(line)) +
        quantity * currentUnit.factor >
        (currentVariant.stock ?? 0)
    ) {
      this.error.set(`Not enough ${currentUnit.stockUnit} for this quantity.`);
      return false;
    }
    this.patch(id, {
      variant: currentVariant,
      packId: currentUnit.packId,
      unitName: currentUnit.name,
      stockUnit: currentUnit.stockUnit,
      unitsPerUnit: currentUnit.factor,
      quantity,
      unitPrice: currentUnit.price,
      customPrice: null,
      overrideReason: '',
      priceSource: currentUnit.packId ? 'pack' : 'retail',
    });
    this.error.set(null);
    return true;
  }

  /** Refresh shared availability while preserving each line's agreed unit and price. */
  private refreshStock(variant: Variant): void {
    this.lines.update(lines =>
      lines.map(line =>
        line.variant.variant_id === variant.variant_id
          ? {
              ...line,
              variant: {
                ...line.variant,
                stock: variant.stock,
                track_inventory: variant.track_inventory,
              },
            }
          : line
      )
    );
  }

  /** Restore document intent, including shortages, for explicit review before checkout. */
  restoreLine(line: CartLine): void {
    this.lines.update(lines => [...lines, { ...line, id: line.id ?? crypto.randomUUID() }]);
  }

  quantityStep(variant: Variant): number {
    return variant.allow_fractional ? 0.5 : 1;
  }

  setQuantity(variantId: string, quantity: number): boolean {
    const line = this.findLine(variantId);
    if (!line) return false;
    if (
      !Number.isFinite(quantity) ||
      ((line.packId || !line.variant.allow_fractional) && !Number.isInteger(quantity))
    ) {
      this.error.set(`Enter a whole quantity of ${line.unitName ?? 'items'}.`);
      return false;
    }
    const normalized = quantity;
    if (!(normalized > 0)) {
      this.removeLine(variantId);
      return true;
    }
    if (
      line.variant.track_inventory &&
      this.stockDemand(line.variant.variant_id!, cartLineId(line)) +
        normalized * (line.unitsPerUnit ?? 1) >
        (line.variant.stock ?? 0)
    ) {
      this.error.set('This quantity exceeds available stock.');
      return false;
    }
    this.error.set(null);
    this.patch(variantId, { quantity: normalized });
    return true;
  }

  setCustomPrice(variantId: string, priceAmount: number | null, reason: string): boolean {
    const line = this.findLine(variantId);
    if (!line) return false;
    if (
      priceAmount !== null &&
      (!Number.isSafeInteger(priceAmount) ||
        !(priceAmount > 0) ||
        priceAmount < (line.packId ? line.unitPrice : (line.variant.wholesale_price ?? 0)))
    ) {
      return false;
    }
    this.patch(variantId, { customPrice: priceAmount, overrideReason: reason });
    return true;
  }

  removeLine(variantId: string): void {
    const line = this.findLine(variantId);
    if (line) this.lines.update(lines => lines.filter(l => cartLineId(l) !== cartLineId(line)));
    this.error.set(null);
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
      pack_id: l.packId ?? null,
      units_per_unit: l.unitsPerUnit ?? 1,
      expected_unit_price: l.unitPrice,
      price_source: l.priceSource ?? 'retail',
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
    this.error.set(null);
    this.customerId.set(null);
    this.customerName.set('Walk-in');
    this.draftId.set(null);
  }

  private patch(variantId: string, changes: Partial<CartLine>): void {
    const target = this.findLine(variantId);
    if (!target) return;
    this.lines.update(lines =>
      lines.map(l => (cartLineId(l) === cartLineId(target) ? { ...l, ...changes } : l))
    );
  }
}
