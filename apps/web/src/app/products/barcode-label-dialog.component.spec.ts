import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { PosService, type Variant } from '../pos/pos.service';
import { IconComponent } from '../shared/ui/icon.component';
import { BarcodeLabelDialogComponent } from './barcode-label-dialog.component';
import { BarcodeLabelPrintService, BarcodeLabelRenderError } from './barcode-label-print.service';

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
  afterEach(() => {
    localStorage.removeItem('dukarun-barcode-label-layout');
    localStorage.removeItem('dukarun-barcode-label-rotation');
  });
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

  it('starts a fresh label batch when switching from the base unit to a pack', async () => {
    const page = await setup([
      variant('one', 'BASE', {
        packs: [
          {
            id: 'pack',
            name: 'Carton',
            units_per_pack: 10,
            active: true,
            sale_price: 80,
            barcode: 'PACK',
          },
        ] as Variant['packs'],
      }),
    ]);
    page.fixture.componentRef.setInput('mode', 'single');
    page.fixture.componentRef.setInput('variantId', 'one');
    page.fixture.detectChanges();
    await page.fixture.whenStable();

    const printButton = page.fixture.nativeElement.querySelector(
      '[data-learning-anchor="barcode-print"]'
    ) as HTMLButtonElement;
    printButton.click();
    await page.fixture.whenStable();
    expect(page.printLabels.mock.calls[0][0].map((row: Variant) => row.barcode)).toEqual(['BASE']);
    expect(printButton.disabled).toBe(true);

    const unitSelect = Array.from(
      page.fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>
    ).find(select => Array.from(select.options).some(option => option.value === 'pack'))!;
    unitSelect.value = 'pack';
    unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await page.fixture.whenStable();

    expect(printButton.disabled).toBe(false);
    expect(page.component['handedOffCount']()).toBe(0);
    printButton.click();
    await page.fixture.whenStable();
    expect(page.printLabels.mock.calls[1][0].map((row: Variant) => row.barcode)).toEqual(['PACK']);
  });

  it('persists barcode direction alongside label settings without changing receipt size', async () => {
    const page = await setup([variant('one', 'ONE')]);
    localStorage.setItem('dukarun-print-format', 'receipt-80mm');
    page.component['setRotation'](90);
    page.component['setLayout']('58mm-roll');
    expect(localStorage.getItem('dukarun-barcode-label-rotation')).toBe('90');
    expect(localStorage.getItem('dukarun-print-format')).toBe('receipt-80mm');
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[0][4]).toBe(90);
    page.fixture.destroy();
    TestBed.resetTestingModule();
    const next = await setup([variant('one', 'ONE')]);
    expect(next.component['rotation']()).toBe(90);
    expect(next.component['layout']()).toBe('58mm-roll');
    localStorage.removeItem('dukarun-print-format');
  });
  it('defaults rolls to automatic fitting and remembers explicit Standard and Automatic choices', async () => {
    const rows = [variant('one', 'DRABCDEFABCDEF')];
    const page = await setup(rows);
    page.component['setLayout']('58mm-roll');
    page.fixture.detectChanges();
    expect(page.component['rotation']()).toBe('auto');
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[0][4]).toBe('auto');
    page.component['setRotation'](0);
    expect(localStorage.getItem('dukarun-barcode-label-rotation')).toBe('0');
    page.fixture.destroy();
    TestBed.resetTestingModule();
    const manual = await setup(rows);
    expect(manual.component['rotation']()).toBe(0);
    await manual.component['printCurrentBatch']();
    expect(manual.printLabels.mock.calls[0][4]).toBe(0);
    manual.component['setRotation']('auto');
    expect(localStorage.getItem('dukarun-barcode-label-rotation')).toBe('auto');
    manual.fixture.destroy();
    TestBed.resetTestingModule();
    const automatic = await setup(rows);
    expect(automatic.component['rotation']()).toBe('auto');
    await automatic.component['printCurrentBatch']();
    expect(automatic.printLabels.mock.calls[0][4]).toBe('auto');
  });
  it('clears an obsolete width failure after changing direction and uses the new direction', async () => {
    const row = variant('one', 'DRABCDEFABCDEF');
    const page = await setup([row]);
    page.component['setLayout']('58mm-roll');
    page.component['setRotation'](0);
    page.fixture.detectChanges();
    page.printLabels.mockRejectedValueOnce(
      new BarcodeLabelRenderError([{ variant: row, message: 'This barcode needs more width.' }])
    );
    await page.component['printCurrentBatch']();
    page.fixture.detectChanges();
    expect(page.fixture.nativeElement.textContent).toContain('This barcode needs more width.');
    page.component['setRotation'](90);
    page.fixture.detectChanges();
    expect(page.fixture.nativeElement.textContent).not.toContain('This barcode needs more width.');
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[1][4]).toBe(90);
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
    expect(page.printLabels.mock.calls[0].slice(2)).toEqual([1, 2, 0]);
    await page.component['printCurrentBatch']();
    expect(page.printLabels.mock.calls[1].slice(2)).toEqual([2, 2, 0]);
    page.component['setCopies'](2.8);
    expect(page.component['copies']()).toBe(2);
  });
});
