import { describe, expect, it } from 'vitest';
import {
  buildStorefrontCartMessage,
  storefrontCartCount,
  storefrontCartTotal,
  storefrontLineId,
  type StorefrontCartLine,
} from './storefront-cart.models';

const lines: StorefrontCartLine[] = [
  {
    shopSlug: 'fixture-shop',
    productId: 'product-1',
    variantId: 'variant-1',
    productName: 'Sugar 1kg',
    variantName: 'Default',
    price: 165,
    quantity: 2,
    imagePath: null,
    productUrl: 'https://store.dukarun.com/fixture-shop/products/product-1',
  },
  {
    shopSlug: 'fixture-shop',
    productId: 'product-2',
    variantId: 'variant-2',
    productName: 'Tea',
    variantName: '100 bags',
    price: 320,
    quantity: 1,
    imagePath: null,
    productUrl: 'https://store.dukarun.com/fixture-shop/products/product-2',
  },
];

describe('storefront cart helpers', () => {
  it('counts quantities and totals rounded shilling lines', () => {
    expect(storefrontCartCount(lines)).toBe(3);
    expect(storefrontCartTotal(lines)).toBe(650);
  });

  it('builds a readable WhatsApp basket message', () => {
    const message = buildStorefrontCartMessage(
      'Fixture Shop',
      lines,
      'https://store.dukarun.com/fixture-shop'
    );

    expect(message).toContain("Hello Fixture Shop! I'd like to order:");
    expect(message).toContain('1. Sugar 1kg');
    expect(message).toContain('2. Tea · 100 bags');
    expect(message).toContain('Estimated total: KES 650');
    expect(message).toContain('Catalogue: https://store.dukarun.com/fixture-shop');
  });
});

it('keeps pack and piece basket identities separate and quotes the selected unit', () => {
  const piece = lines[0];
  const pack = {
    ...piece,
    packId: 'bundle',
    unitName: 'Bundle',
    stockUnit: 'packet',
    unitsPerUnit: 10,
    price: 1500,
    quantity: 2,
  };
  expect(storefrontLineId(pack)).not.toBe(storefrontLineId(piece));
  expect(storefrontCartTotal([piece, pack])).toBe(3330);
  const message = buildStorefrontCartMessage('Shop', [pack], '/shop');
  expect(message).toContain('Bundle (10 packet)');
  expect(message).toContain('Qty: 2');
  expect(message).toContain('Line: KES 3,000');
});
