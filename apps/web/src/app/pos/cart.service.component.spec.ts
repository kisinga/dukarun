import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { sellingUnits } from '@dukarun/pack-types';
import { LocationContextService } from '../core/location-context.service';
import { SupabaseService } from '../core/supabase.service';
import { CartService, cartLineId } from './cart.service';
import type { Variant } from './pos.service';

export const packVariant = {
  variant_id: 'variant-eggs',
  product_name: 'Eggs',
  variant_name: 'Default',
  price: 20,
  wholesale_price: 17,
  stock_unit: 'egg',
  stock: 61,
  track_inventory: true,
  allow_fractional: false,
  kind: 'good',
  product_active: true,
  variant_active: true,
  packs: [
    {
      id: 'tray',
      name: 'Tray',
      units_per_pack: 30,
      sale_price: 480,
      barcode: 'EGG-TRAY',
      active: true,
    },
  ],
} as Variant;

describe('Pack cart', () => {
  function cart(): CartService {
    TestBed.configureTestingModule({
      providers: [
        CartService,
        { provide: SupabaseService, useValue: { offlineIdentity: signal(null) } },
        { provide: LocationContextService, useValue: { activeId: signal(null) } },
      ],
    });
    return TestBed.inject(CartService);
  }
  it('keeps pack and piece identities, prices and quantity controls separate', () => {
    const service = cart();
    const [piece, tray] = sellingUnits(packVariant);
    service.addUnit(packVariant, tray);
    service.addUnit(packVariant, piece);
    const [box, loose] = service.lines();
    expect(cartLineId(box)).not.toBe(cartLineId(loose));
    service.setQuantity(cartLineId(loose), 2);
    expect(service.total()).toBe(520);
    expect(service.stockDemand('variant-eggs')).toBe(32);
    expect(service.toSaleLines()).toMatchObject([
      { pack_id: 'tray', quantity: 1, expected_unit_price: 480, units_per_unit: 30 },
      { pack_id: null, quantity: 2, expected_unit_price: 20, units_per_unit: 1 },
    ]);
  });
  it('checks stock across all selling units before adding a pack', () => {
    const service = cart();
    const [piece, tray] = sellingUnits(packVariant);
    service.addUnit(packVariant, piece);
    service.setQuantity(cartLineId(service.lines()[0]), 2);
    expect(service.addUnit(packVariant, tray)).toBe(true);
    expect(service.addUnit(packVariant, tray)).toBe(false);
    expect(service.stockDemand('variant-eggs')).toBe(32);
  });

  it('combines whole rolls and fractional base units without permitting fractional packs', () => {
    const service = cart();
    const cable = {
      ...packVariant,
      variant_id: 'variant-cable',
      stock_unit: 'metre',
      allow_fractional: true,
      stock: 90.5,
      packs: [
        {
          ...packVariant.packs![0],
          id: 'roll',
          name: 'Roll',
          units_per_pack: 90,
          sale_price: 1500,
        },
      ],
    };
    const [metre, roll] = sellingUnits(cable);
    expect(service.addUnit(cable, metre)).toBe(true);
    const looseId = cartLineId(service.lines()[0]);
    expect(service.setQuantity(looseId, 0.5)).toBe(true);
    expect(service.addUnit(cable, roll)).toBe(true);
    const rollId = cartLineId(service.lines()[1]);
    expect(service.stockDemand(cable.variant_id)).toBe(90.5);
    expect(service.total()).toBe(1510);
    expect(service.setQuantity(rollId, 0.5)).toBe(false);
    expect(service.setQuantity(looseId, 1)).toBe(false);
    expect(service.changeUnit(rollId, metre, 90)).toBe(true);
    expect(service.stockDemand(cable.variant_id)).toBe(90.5);
  });
  it('uses configured pack price as its floor, independent of wholesale equivalent', () => {
    const service = cart();
    service.addVariant({ ...packVariant, selected_pack_id: 'tray' });
    const id = cartLineId(service.lines()[0]);
    expect(service.total()).toBe(480);
    expect(service.setCustomPrice(id, 479, 'discount')).toBe(false);
    expect(service.setCustomPrice(id, 500, 'special price')).toBe(true);
    expect(service.changeUnit(id, sellingUnits(packVariant)[0], 30)).toBe(true);
    expect(service.lines()[0]).toMatchObject({
      quantity: 30,
      unitPrice: 20,
      customPrice: null,
      overrideReason: '',
    });
    expect(service.changeUnit(id, sellingUnits(packVariant)[0], 0.5)).toBe(false);
  });
  it('adds against refreshed stock and updates availability for sibling units', () => {
    const service = cart();
    const [piece, tray] = sellingUnits(packVariant);
    service.addUnit({ ...packVariant, stock: 31 }, tray);
    service.addUnit({ ...packVariant, stock: 31 }, piece);
    expect(service.addUnit({ ...packVariant, stock: 100 }, piece)).toBe(true);
    expect(service.lines()[1].quantity).toBe(2);
    expect(service.setQuantity(cartLineId(service.lines()[0]), 3)).toBe(true);
    expect(service.stockDemand('variant-eggs')).toBe(92);
    expect(service.error()).toBeNull();
    expect(service.addUnit({ ...packVariant, stock: 92 }, piece)).toBe(false);
    expect(service.setQuantity(cartLineId(service.lines()[1]), 3)).toBe(false);
    expect(service.stockDemand('variant-eggs')).toBe(92);
  });
  it('reports a rejected quantity increment as a failed add', () => {
    const service = cart();
    const [piece] = sellingUnits(packVariant);
    service.addUnit(packVariant, piece);
    // A catalog quantity-type change must not silently reinterpret the old line.
    expect(service.addUnit({ ...packVariant, allow_fractional: true }, piece)).toBe(false);
    expect(service.lines()[0].quantity).toBe(1);
    expect(service.error()).not.toBeNull();
  });
});
