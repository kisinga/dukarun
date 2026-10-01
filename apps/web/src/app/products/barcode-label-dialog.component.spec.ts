import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { PosService, type Variant } from '../pos/pos.service';
import { IconComponent } from '../shared/ui/icon.component';
import { BarcodeLabelDialogComponent } from './barcode-label-dialog.component';
import { BarcodeLabelPrintService } from './barcode-label-print.service';

const variant = (id: string, barcode: string | null, extra: Partial<Variant> = {}): Variant =>
  ({
    variant_id: id,
    product_id: `product-${id}`,
    product_name: `Product ${id}`,
    variant_name: 'Default',
    product_active: true,
    variant_active: true,
    barcode,
    packs: [],
    ...extra,
  }) as Variant;

async function setup(variants: Variant[]) {
  const printLabels = vi.fn().mockResolvedValue(undefined);
  const assign = vi.fn();
  TestBed.configureTestingModule({
    imports: [BarcodeLabelDialogComponent],
    providers: [
      { provide: PosService, useValue: { assignMissingVariantBarcodes: assign } },
      { provide: CatalogCacheService, useValue: { refresh: vi.fn() } },
      { provide: PermissionsService, useValue: { has: () => true } },
      { provide: BarcodeLabelPrintService, useValue: { printLabels } },
    ],
  });
  TestBed.overrideComponent(IconComponent, { set: { template: '' } });
  const fixture = TestBed.createComponent(BarcodeLabelDialogComponent);
  fixture.componentRef.setInput('mode', 'selection');
  fixture.componentRef.setInput('variants', variants);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, component: fixture.componentInstance, printLabels, assign };
}

describe('Selected label printing', () => {
  it('defaults to base variants and active priced packs and identifies excluded entries', async () => {
    const row = variant('one', 'BASE', {
      packs: [
        {
          id: 'pack',
          name: 'Carton',
          units_per_pack: 10,
          active: true,
          sale_price: 80,
          barcode: 'PACK',
        },
        {
          id: 'retired',
          name: 'Old pack',
          units_per_pack: 5,
          active: false,
          sale_price: 30,
          barcode: 'OLD',
        },
        {
          id: 'unpriced',
          name: 'Unpriced pack',
          units_per_pack: 2,
          active: true,
          sale_price: null,
          barcode: 'UNPRICED',
        },
      ] as Variant['packs'],
    });
    const page = await setup([
      row,
      variant('missing', null),
      variant('inactive', 'INACTIVE', { variant_active: false }),
      variant('hidden', 'HIDDEN'),
    ]);
    expect(
      page.component['printBatches']()
        .flat()
        .map(row => row.barcode)
    ).toEqual(['BASE', 'PACK', 'HIDDEN']);
    const text = page.fixture.nativeElement.textContent;
    expect(text).toContain('missing — excluded');
    expect(text).toContain('Inactive variant');
    expect(text).toContain('Inactive pack');
    expect(text).toContain('Pack has no sale price');
    expect(text).not.toContain('Generate missing barcodes');
    await page.component['generateMissing']();
    expect(page.assign).not.toHaveBeenCalled();
  });

  it('classifies before deselection so ambiguity cannot be hidden', async () => {
    const rows = [
      variant('one', 'DUPLICATE'),
      variant('two', 'DUPLICATE'),
      variant('three', 'READY'),
    ];
    const page = await setup(rows);
    expect(page.component['ambiguous']().length).toBe(2);
    page.component['toggleLabel'](rows[0]);
    expect(page.component['ambiguous']().length).toBe(2);
    expect(
      page.component['printBatches']()
        .flat()
        .map(row => row.barcode)
    ).toEqual(['READY']);
    page.component['toggleLabel'](rows[2]);
    expect(page.component['printBatches']()).toEqual([]);
  });

  it('bounds shared copies and prints in batches of 500 using the existing layout', async () => {
    const rows = [variant('one', 'ONE'), variant('two', 'TWO')];
    const page = await setup(rows);
    expect(page.component['copies']()).toBe(1);
    page.component['setCopies'](0);
    expect(page.component['copies']()).toBe(1);
    page.component['setCopies'](501);
    expect(page.component['copies']()).toBe(500);
    expect(page.component['printBatches']().map(batch => batch.length)).toEqual([500, 500]);
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[0][0]).toHaveLength(500);
    expect(page.printLabels.mock.calls[0].slice(2)).toEqual([1, 2]);
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[1].slice(2)).toEqual([2, 2]);
    page.component['setCopies'](2.8);
    expect(page.component['copies']()).toBe(2);
  });
});
