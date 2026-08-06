/**
 * CustomPriceCalculationStrategy tests
 *
 * Ensures custom line prices are returned in smallest currency unit (cents) so
 * Vendure stores order totals correctly. Would have caught the /100 bug.
 */

import { describe, expect, it } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CustomPriceCalculationStrategy } from '../../../src/plugins/pricing/custom-price-calculation.strategy';

describe('CustomPriceCalculationStrategy', () => {
  const strategy = new CustomPriceCalculationStrategy();
  const ctx = { channelId: 1 } as RequestContext;
  const productVariant = {
    id: '11',
    price: 10000,
    priceWithTax: 11500,
    listPriceIncludesTax: true,
    customFields: {},
  } as any;
  const order = {} as any;

  const calculate = (
    orderLineCustomFields: { [key: string]: any },
    quantity: number,
    requestCtx: RequestContext = ctx
  ) => {
    const result = strategy.calculateUnitPrice(
      requestCtx,
      productVariant,
      orderLineCustomFields,
      order,
      quantity
    );
    return Promise.resolve(result);
  };

  describe('customLinePrice in cents', () => {
    it('returns unit price in cents (9700 cents line total, qty 1 => 9700)', async () => {
      const result = await calculate({ customLinePrice: 9700 }, 1);
      expect(result).toEqual({ price: 9700, priceIncludesTax: true });
    });

    it('returns unit price in cents per unit (10000 cents line total, qty 2 => 5000 per unit)', async () => {
      const result = await calculate({ customLinePrice: 10000 }, 2);
      expect(result).toEqual({ price: 5000, priceIncludesTax: true });
    });

    it('createOrder input in cents is preserved (regression: no /100)', async () => {
      const result = await calculate(
        { customLinePrice: 9700, priceOverrideReason: '3% decrease' },
        1
      );
      expect(result.price).toBe(9700);
      expect(result.price).not.toBe(97);
    });
  });

  describe('no custom price', () => {
    it('falls through to variant priceWithTax when channel pricesIncludeTax', async () => {
      const ctxWithTax = { ...ctx, channel: { pricesIncludeTax: true } } as any;
      const result = await strategy.calculateUnitPrice(ctxWithTax, productVariant, {}, order, 1);
      expect(result).toEqual({ price: 11500, priceIncludesTax: true });
    });

    it('falls through to variant price when channel does not include tax', async () => {
      const ctxNoTax = { ...ctx, channel: { pricesIncludeTax: false } } as any;
      const result = await strategy.calculateUnitPrice(ctxNoTax, productVariant, {}, order, 1);
      expect(result).toEqual({ price: 10000, priceIncludesTax: true });
    });

    it('ignores customLinePrice when 0', async () => {
      const ctxWithTax = { ...ctx, channel: { pricesIncludeTax: true } } as any;
      const result = await strategy.calculateUnitPrice(
        ctxWithTax,
        productVariant,
        { customLinePrice: 0 },
        order,
        1
      );
      expect(result).toEqual({ price: 11500, priceIncludesTax: true });
    });
  });

  describe('wholesale guard', () => {
    it('still returns custom unit price when below wholesale (logs only)', async () => {
      const variantWithWholesale = {
        ...productVariant,
        customFields: { wholesalePrice: 9000 },
      };
      const result = await strategy.calculateUnitPrice(
        ctx,
        variantWithWholesale,
        { customLinePrice: 8000 },
        order,
        1
      );
      expect(result).toEqual({ price: 8000, priceIncludesTax: true });
    });
  });

  describe('invalid fractional quantity', () => {
    it('throws when quantity has more than one decimal place', () => {
      expect(() =>
        strategy.calculateUnitPrice(ctx, productVariant, { customLinePrice: 9700 }, order, 1.55)
      ).toThrow('Quantity can have at most 1 decimal place');

      expect(() =>
        strategy.calculateUnitPrice(ctx, productVariant, { customLinePrice: 9700 }, order, 0.123)
      ).toThrow('Quantity can have at most 1 decimal place');
    });

    it('accepts quantity with at most one decimal place', async () => {
      const result = await calculate({ customLinePrice: 5000 }, 0.5);
      expect(result).toEqual({ price: 10000, priceIncludesTax: true });
    });
  });
});
