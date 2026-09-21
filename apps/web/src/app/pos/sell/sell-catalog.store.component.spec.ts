import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { sellingUnits } from '@dukarun/pack-types';
import { CatalogCacheService } from '../../core/catalog-cache.service';
import { LocationContextService } from '../../core/location-context.service';
import { SupabaseService } from '../../core/supabase.service';
import { ScanFeedbackService } from '../../shared/ui/scan-feedback.service';
import { CartService, cartLineId } from '../cart.service';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { PosService, type Variant } from '../pos.service';
import { SellCatalogStore } from './sell-catalog.store';

const original = {
  variant_id: 'eggs',
  product_id: 'eggs-product',
  product_name: 'Eggs',
  variant_name: 'Default',
  variant_active: true,
  product_active: true,
  price: 20,
  wholesale_price: 17,
  stock_unit: 'egg',
  stock: 61,
  track_inventory: true,
  allow_fractional: false,
  kind: 'good',
  packs: [
    { id: 'tray', name: 'Tray', units_per_pack: 30, sale_price: 480, active: true, barcode: null },
  ],
} as Variant;

function setup(current: Variant = original, online = true) {
  const variantById = vi.fn().mockResolvedValue(current);
  const activeId = signal('main');
  const catalog = signal([current]);
  TestBed.configureTestingModule({
    providers: [
      CartService,
      SellCatalogStore,
      { provide: PosService, useValue: { variantById } },
      { provide: CatalogCacheService, useValue: { catalog } },
      { provide: ConnectivityService, useValue: { online: signal(online) } },
      { provide: LocationContextService, useValue: { activeId } },
      { provide: SupabaseService, useValue: { offlineIdentity: signal(null) } },
      { provide: ScanFeedbackService, useValue: {} },
      { provide: SyncService, useValue: {} },
    ],
  });
  const cart = TestBed.inject(CartService);
  cart.addUnit(original, sellingUnits(original)[1]);
  return { store: TestBed.inject(SellCatalogStore), cart, variantById, activeId, catalog };
}

describe('Editing current selling units', () => {
  it('loads the current price and stock, preserving the sale until the edit is confirmed', async () => {
    const current = {
      ...original,
      stock: 100,
      packs: [{ ...original.packs![0], sale_price: 500 }],
    };
    const { store, cart, variantById } = setup(current);
    cart.addUnit(original, sellingUnits(original)[0]);
    const line = cart.lines()[0];
    cart.setCustomPrice(cartLineId(line), 510, 'Agreed price');
    await store.openUnitEditor(cart.findLine(cartLineId(line))!);
    expect(variantById).toHaveBeenCalledWith('eggs');
    expect(store.availableForSelection()).toBe(99);
    expect(cart.toSaleLines()[0]).toMatchObject({ expected_unit_price: 480, custom_price: 510 });
    store.chooseUnit({ unit: sellingUnits(store.unitSelection()!.variant)[1], quantity: 3 });
    expect(store.unitSelection()).toBeNull();
    expect(cart.toSaleLines()[0]).toMatchObject({
      quantity: 3,
      expected_unit_price: 500,
      units_per_unit: 30,
    });
    expect(cart.lines()[0].customPrice).toBeNull();
    expect(cart.stockDemand('eggs')).toBe(91);
    expect(cart.lines()[1].variant.stock).toBe(100);
    expect(cart.lines()[1].unitPrice).toBe(20);
  });

  it('offers replacement packs instead of retired packs from the old cart', async () => {
    const current = {
      ...original,
      packs: [
        { ...original.packs![0], active: false },
        { ...original.packs![0], id: 'box', name: 'Box', units_per_pack: 10, sale_price: 170 },
      ],
    };
    const { store, cart } = setup(current);
    await store.openUnitEditor(cart.lines()[0]);
    const choices = sellingUnits(store.unitSelection()!.variant);
    expect(choices.map(unit => unit.packId)).toEqual([null, 'box']);
    store.chooseUnit({ unit: choices[1], quantity: 3 });
    expect(cart.toSaleLines()[0]).toMatchObject({
      pack_id: 'box',
      units_per_unit: 10,
      expected_unit_price: 170,
      quantity: 3,
    });
  });

  it('uses the latest cached definitions while offline', async () => {
    const current = { ...original, stock: 30, packs: [{ ...original.packs![0], sale_price: 500 }] };
    const { store, cart, variantById } = setup(current, false);
    await store.openUnitEditor(cart.lines()[0]);
    expect(variantById).not.toHaveBeenCalled();
    expect(store.unitSelection()!.variant).toBe(current);
    store.chooseUnit({ unit: sellingUnits(current)[1], quantity: 2 });
    expect(cart.lines()[0].quantity).toBe(1);
    expect(cart.error()).toContain('Not enough');
    expect(store.unitSelection()).not.toBeNull();
  });

  it('does not fall back to old prices when fetching current definitions fails', async () => {
    const { store, cart, variantById } = setup();
    variantById.mockRejectedValue(new Error('Catalog lookup failed'));
    await store.openUnitEditor(cart.lines()[0]);
    expect(store.unitSelection()).toBeNull();
    expect(store.error()).toBe('Catalog lookup failed');
    expect(cart.toSaleLines()[0].expected_unit_price).toBe(480);
  });

  it('ignores a pending lookup after the location changes or the dialog is closed', async () => {
    const { store, cart, variantById, activeId } = setup();
    let resolve!: (variant: Variant) => void;
    variantById.mockImplementation(
      () =>
        new Promise<Variant>(done => {
          resolve = done;
        })
    );
    const pending = store.openUnitEditor(cart.lines()[0]);
    activeId.set('branch');
    resolve(original);
    await pending;
    expect(store.unitSelection()).toBeNull();
    const cancelled = store.openUnitEditor(cart.lines()[0]);
    store.closeUnitSelection();
    resolve(original);
    await cancelled;
    expect(store.unitSelection()).toBeNull();
  });
});
