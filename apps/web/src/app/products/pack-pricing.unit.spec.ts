import { describe, expect, it } from 'vitest';
import { packWholesaleComparison, sellingUnits, transactionUnitLabel } from '@dukarun/pack-types';

describe('Pack pricing and snapshots', () => {
  it('surfaces the comparison without deriving or changing the pack price', () => {
    const variant = {
      price: 20,
      wholesale_price: 17,
      stock_unit: 'egg',
      packs: [
        {
          id: 'tray',
          name: 'Tray',
          units_per_pack: 30,
          sale_price: 480,
          active: true,
          barcode: null,
        },
        {
          id: 'crate',
          name: 'Crate',
          units_per_pack: 300,
          sale_price: null,
          active: true,
          barcode: null,
        },
      ],
    };
    expect(sellingUnits(variant).map(unit => unit.price)).toEqual([20, 480]);
    expect(packWholesaleComparison(480, 30, 17)).toBe('5.9% below wholesale equivalent');
    const changedWholesale = { ...variant, wholesale_price: 16 };
    expect(sellingUnits(changedWholesale).at(-1)?.price).toBe(480);
    expect(packWholesaleComparison(480, 30, 0)).toBe('');
  });
  it('labels historical units directly from the line snapshot', () => {
    expect(
      transactionUnitLabel({ unit_name: 'Box', units_per_unit: 100, stock_unit_name: 'tablet' })
    ).toBe('Box (100 tablet)');
  });
});
