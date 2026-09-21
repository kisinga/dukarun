import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProductEditorVariantsComponent } from './product-editor-variants.component';
import type { ProductEditorRow } from './product-editor.types';

describe('ProductEditorVariantsComponent', () => {
  it('shows pack editing for fractional goods but not services', () => {
    const fixture = TestBed.createComponent(ProductEditorVariantsComponent);
    const row: ProductEditorRow = {
      key: 'cable',
      variantId: 'cable',
      name: 'Cable',
      price: '20',
      sku: 'CABLE',
      barcode: '',
      pendingBarcode: null,
      wholesale: '',
      kind: 'good',
      trackInventory: true,
      allowFractional: true,
      stockUnit: 'metre',
      packs: [],
      openingQuantity: '',
      openingUnitCost: '',
      openingLocationId: '',
      batchNumber: '',
      expiryDate: '',
      active: true,
    };
    for (const [key, value] of Object.entries({
      rows: [row],
      loading: false,
      barcodeMaxLength: 64,
      familyBarcode: '',
      stockLocations: [],
      batchExpiryEnabled: false,
      duplicateLabels: false,
      barcodeConflict: false,
      stockLookup: () => undefined,
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-product-packs-editor')).not.toBeNull();
    fixture.componentRef.setInput('rows', [{ ...row, kind: 'service', allowFractional: false }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-product-packs-editor')).toBeNull();
  });
});
