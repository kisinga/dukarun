import { describe, expect, it } from 'vitest';
import { resolveLinkedSupplier } from './purchase-editor-link';

describe('resolveLinkedSupplier', () => {
  it('accepts an active linked supplier', () => {
    expect(
      resolveLinkedSupplier('supplier-1', [{ id: 'supplier-1', supplier_active: true }])
    ).toEqual({ supplierId: 'supplier-1', error: null });
  });

  it('distinguishes archived and missing suppliers', () => {
    expect(
      resolveLinkedSupplier('supplier-1', [{ id: 'supplier-1', supplier_active: false }])
    ).toEqual({ supplierId: null, error: 'The linked supplier is archived' });
    expect(resolveLinkedSupplier('missing', [])).toEqual({
      supplierId: null,
      error: 'The linked supplier was not found',
    });
  });
});
