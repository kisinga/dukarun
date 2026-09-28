import { describe, expect, it } from 'vitest';
import { productIdentityLabel } from './product-identity';

describe('product display labels', () => {
  it('preserves distinguishing variants without repeating a suffix already in the name', () => {
    expect(productIdentityLabel({ product_name: 'Tea', variant_name: 'Small pack' })).toBe(
      'Tea — Small pack'
    );
    expect(
      productIdentityLabel({ product_name: 'Tea · Small pack', variant_name: 'Small pack' })
    ).toBe('Tea · Small pack');
    expect(
      productIdentityLabel({ product_name: 'Tea — Small pack', variant_name: 'Small pack' })
    ).toBe('Tea — Small pack');
    expect(
      productIdentityLabel({ product_name: 'Small pack of tea', variant_name: 'Small pack' })
    ).toBe('Small pack of tea — Small pack');
  });
  it('keeps default and unresolved identities clear', () => {
    expect(productIdentityLabel({ product_name: 'Tea', variant_name: 'Default' })).toBe('Tea');
    expect(productIdentityLabel({ product_name: 'Tea', variant_name: '' })).toBe('Tea');
    expect(
      productIdentityLabel({
        product_name: 'Tea',
        variant_name: 'Green',
        identity_resolution: 'unresolved',
      })
    ).toBe('Details unavailable');
  });
});
