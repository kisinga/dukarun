import { describe, expect, it } from 'vitest';
import type { Workbook, Row } from 'exceljs';
import { createExcelWorkbook } from '../shared/excel-workbook';
import { exportProductWorkbook } from './product-workbook-export';
import { readProductWorkbook } from './product-workbook-read';
import { workbookFixture } from './product-workbook.fixture';

const bySku = (book: Workbook, sku: string): Row => {
  let found: Row | undefined;
  book.getWorksheet('Products')!.eachRow(row => {
    if (row.getCell(13).value === sku) found = row;
  });
  if (!found) throw new Error(`Missing ${sku}`);
  return found;
};
const packRow = (book: Workbook): Row => {
  let found: Row | undefined;
  book.getWorksheet('Products')!.eachRow(row => {
    if (String(row.getCell(28).value).startsWith('p:')) found = row;
  });
  return found!;
};
const add = (
  book: Workbook,
  offset: number,
  product: string,
  maker: string,
  size: string,
  sold: string,
  price?: number
): Row => {
  const row = book.getWorksheet('Products')!.getRow(10 + offset);
  [product, maker, size, sold].forEach((v, i) => {
    row.getCell(i + 1).value = v;
  });
  if (price !== undefined) row.getCell(6).value = price;
  return row;
};
async function setup() {
  const snapshot = workbookFixture();
  return { snapshot, book: await exportProductWorkbook(snapshot) };
}

describe('Products workbook', () => {
  it('does not inherit a variant barcode on a pack with no barcode', async () => {
    const snapshot = workbookFixture();
    snapshot.packs[0].barcode = null;
    const book = await exportProductWorkbook(snapshot);
    expect(packRow(book).getCell(14).value).toBeNull();
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).lines).toEqual([]);
  });
  it('round trips packs whose names differ only in case without renaming them', async () => {
    const snapshot = workbookFixture();
    snapshot.packs.push({
      ...snapshot.packs[0],
      id: '85000000-0000-4000-8000-000000000099',
      variant_id: snapshot.variants[1].id,
      name: 'box',
      barcode: null,
    });
    const book = await exportProductWorkbook(snapshot);
    const loaded = await createExcelWorkbook();
    await loaded.xlsx.load(await book.xlsx.writeBuffer());
    const p = readProductWorkbook(loaded, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.conflicts).toEqual([]);
    expect(p.lines).toEqual([]);
    expect(p.changes.products).toEqual([]);
  });
  it('rejects identical pack definitions added to a workbook with no packs', async () => {
    const snapshot = workbookFixture();
    snapshot.packs = [];
    const book = await exportProductWorkbook(snapshot);
    for (const n of [6, 7]) {
      const row = book.getWorksheet('Pack sizes')!.getRow(n);
      row.getCell(1).value = 'Box';
      row.getCell(2).value = 12;
    }
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors).toContain(
      'Pack sizes: duplicate Box / 12. Use one definition.'
    );
  });
  it.each([
    { sold: 'Single item', itemType: 'Service', kind: 'service', tracked: false },
    { sold: 'Per service', itemType: 'Good', kind: 'good', tracked: true },
  ])('uses the edited $itemType item type for new-row tracking defaults', async testCase => {
    const { snapshot, book } = await setup();
    const row = add(book, 0, 'New entry', '', '', testCase.sold, 20);
    row.getCell(16).value = testCase.itemType;
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.products[0].variants[0].values).toMatchObject({
      kind: testCase.kind,
      track_inventory: testCase.tracked,
    });
  });
  it.each([false, true])(
    'enables tracking without interpreting blocked batch cells as edits (retained batch: %s)',
    async retainedBatch => {
      const snapshot = workbookFixture();
      snapshot.packs = [];
      snapshot.variants[1].track_inventory = false;
      if (retainedBatch) {
        snapshot.stock[1].batch!.batch_number = 'RETAINED';
        snapshot.stock[1].batch!.expiry_date = '2027-03-01';
      } else {
        snapshot.stock[1] = {
          variant_id: snapshot.variants[1].id,
          quantity: 0,
          value: 0,
          batch: null,
        };
      }
      const book = await exportProductWorkbook(snapshot);
      const row = bySku(book, 'SOAP500');
      expect(row.getCell(22).value).toBe('XXXX');
      expect(row.getCell(23).value).toBe('XXXX');
      row.getCell(17).value = 'Yes';
      const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
      expect(p.errors).toEqual([]);
      expect(p.conflicts).toEqual([]);
      expect(p.changes.products[0].variants[0].values.track_inventory).toBe(true);
      expect(p.changes.batches).toEqual([]);
      expect(p.changes.stock).toEqual([]);
      expect(p.lines.map(line => line.field)).toEqual(['Track stock?']);
    }
  );
  it('creates zero-priced services and fractional opening stock from an empty-shop workbook', async () => {
    const snapshot = workbookFixture();
    snapshot.products = [];
    snapshot.variants = [];
    snapshot.packs = [];
    snapshot.stock = [];
    const book = await exportProductWorkbook(snapshot);
    add(book, 0, 'Delivery', '', '', 'Per service', 0);
    const rice = add(book, 1, 'Rice', '', '', 'Per kg', 160);
    rice.getCell(12).value = 12.5;
    rice.getCell(10).value = 0;
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(
      p.changes.products.find(p => p.values.name === 'Delivery')!.variants[0].values
    ).toMatchObject({ price: 0, kind: 'service', track_inventory: false });
    expect(p.lines.some(l => l.field === 'Retail' && l.after === '0')).toBe(true);
    expect(p.changes.products.find(p => p.values.name === 'Rice')!.variants[0]).toMatchObject({
      opening_quantity: 12.5,
      opening_unit_cost: 0,
    });
  });
  it('keeps existing duplicate display names distinct and rejects ambiguous new pack parents', async () => {
    const snapshot = workbookFixture();
    const product = { ...snapshot.products[0], id: '85000000-0000-4000-8000-000000000099' };
    snapshot.products.push(product);
    snapshot.variants.push({
      ...snapshot.variants[0],
      id: '85000000-0000-4000-8000-000000000098',
      product_id: product.id,
      sku: 'DUP-SOAP',
      barcode: null,
    });
    const book = await exportProductWorkbook(snapshot);
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors).toEqual([]);
    add(book, 1, 'Soap', 'Soap Works', '250g', 'Box of 12 bars', 540);
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'exactly one matching'
    );
  });
  it('blocks pack-only metadata and allows unchanged retired packs on fractional variants', async () => {
    const { snapshot, book } = await setup();
    packRow(book).getCell(13).value = 'PACK-SKU';
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'SKU belongs on'
    );
    snapshot.variants[0].allow_fractional = true;
    snapshot.packs[0].active = false;
    const measured = await exportProductWorkbook(snapshot);
    expect(readProductWorkbook(measured, 'Products.xlsx', snapshot).errors).toEqual([]);
  });
  it('does not accept buying cost without creating opening inventory', async () => {
    const { snapshot, book } = await setup();
    const row = add(book, 0, 'New rice', '', '', 'Per kg', 160);
    row.getCell(12).value = 0;
    row.getCell(10).value = 120;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'opening Counted stock'
    );
  });
  it('round trips a real XLSX without changes, keeping three sheets and all primary columns visible', async () => {
    const { snapshot, book } = await setup();
    const loaded = await createExcelWorkbook();
    await loaded.xlsx.load(await book.xlsx.writeBuffer());
    expect(loaded.worksheets.filter(s => s.state === 'visible').map(s => s.name)).toEqual([
      'Products',
      'Manufacturers',
      'Pack sizes',
    ]);
    for (let c = 1; c <= 12; c++)
      expect(loaded.getWorksheet('Products')!.getColumn(c).hidden).toBeFalsy();
    const preview = readProductWorkbook(loaded, 'Products.xlsx', snapshot);
    expect(preview.errors).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.lines).toEqual([]);
    expect(preview.changes.products).toEqual([]);
  });
  it('rejects old formats', async () => {
    const book = await createExcelWorkbook();
    book.addWorksheet('Products & Stock');
    expect(() => readProductWorkbook(book, 'old.xlsx', workbookFixture())).toThrow(
      'Download a fresh'
    );
  });
  it('edits retail, clears wholesale and counts zero without touching sibling stock', async () => {
    const { snapshot, book } = await setup();
    const row = bySku(book, 'SOAP250');
    row.getCell(6).value = 55;
    row.getCell(8).value = 'CLEAR';
    row.getCell(12).value = 0;
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.stock).toHaveLength(1);
    expect(p.changes.stock[0].new_stock_quantity).toBe(0);
    expect(p.changes.products[0].variants[0].values).toMatchObject({
      price: 55,
      wholesale_price: null,
    });
  });
  it('creates a manufacturer, product, variant, opening stock and pack in the same workbook', async () => {
    const { snapshot, book } = await setup();
    const m = book.getWorksheet('Manufacturers')!.getRow(7);
    m.getCell(1).value = 'Example Care';
    const base = add(book, 0, 'Handwash', 'Example Care', '500ml', 'Single bottle', 180);
    base.getCell(10).value = 120;
    base.getCell(12).value = 24;
    const ref = book.getWorksheet('Pack sizes')!.getRow(7);
    ref.getCell(1).value = 'Carton';
    ref.getCell(2).value = 6;
    add(book, 1, 'Handwash', 'Example Care', '500ml', 'Carton of 6 bottles', 1020);
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.manufacturers).toHaveLength(1);
    const product = p.changes.products.find(p => p.values.name === 'Handwash')!;
    expect(product.id).toBeNull();
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({
      opening_quantity: 24,
      opening_unit_cost: 120,
      packs: [{ name: 'Carton', units_per_pack: 6, sale_price: 1020 }],
    });
  });
  it('finds a new Single row below its pack with unrelated rows between', async () => {
    const { snapshot, book } = await setup();
    add(book, 0, 'Water', '', '500ml', 'Box of 12 bottles', 420);
    add(book, 1, 'Unrelated', '', '', 'Single item', 20);
    add(book, 2, 'Water', '', '500ml', 'Single bottle', 40);
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(
      p.changes.products.find(p => p.values.name === 'Water')!.variants[0].packs[0].sale_price
    ).toBe(420);
  });
  it('adds a size/type to an existing product while inheriting product metadata', async () => {
    const snapshot = workbookFixture();
    snapshot.products[0].barcode = 'PARENT';
    snapshot.products[0].tax_category_id = snapshot.taxes[0].id;
    const book = await exportProductWorkbook(snapshot);
    add(book, 0, 'Soap', 'Soap Works', '1kg', 'Single bar', 150);
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.products).toHaveLength(1);
    expect(p.changes.products[0].values).toMatchObject({
      barcode: 'PARENT',
      tax_category_id: snapshot.taxes[0].id,
    });
    expect(p.changes.products[0].variants[0].id).toBeNull();
  });
  it('keeps omitted rows unchanged and rejects a pack whose parent row is missing', async () => {
    const { snapshot, book } = await setup();
    bySku(book, 'SOAP500').values = [];
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).changes.products).toEqual([]);
    bySku(book, 'SOAP250').values = [];
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'exactly one matching'
    );
  });
  it('follows reference renames through stable IDs without relying on formula caches', async () => {
    const { snapshot, book } = await setup();
    book.getWorksheet('Manufacturers')!.getCell('A6').value = 'New Soap Works';
    book.getWorksheet('Pack sizes')!.getCell('A6').value = 'Carton';
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.manufacturers[0].name).toBe('New Soap Works');
    expect(p.changes.products[0].variants[0].packs[0].name).toBe('Carton');
  });
  it('applies one deliberate product rename without unchanged repeated cells undoing it', async () => {
    const { snapshot, book } = await setup();
    bySku(book, 'SOAP250').getCell(1).value = 'Laundry Soap';
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.products[0].values.name).toBe('Laundry Soap');
    bySku(book, 'SOAP500').getCell(1).value = 'Different Soap';
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'conflicting edits'
    );
  });
  it('blocks pack stock, pack wholesale, zero pack retail, and changed contents', async () => {
    for (const [c, value] of [
      [12, 1],
      [8, 100],
      [6, 0],
    ] as const) {
      const { snapshot, book } = await setup();
      packRow(book).getCell(c).value = value;
      expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.length).toBeGreaterThan(0);
    }
    const { snapshot, book } = await setup();
    book.getWorksheet('Pack sizes')!.getCell('B6').value = 24;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'contents are fixed'
    );
  });
  it('accepts measured counts, rejects fractional bars and excess precision', async () => {
    const { snapshot, book } = await setup();
    bySku(book, 'RICE').getCell(12).value = 35.751;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors).toEqual([]);
    bySku(book, 'RICE').getCell(12).value = 35.7511;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      '3 decimal'
    );
    bySku(book, 'SOAP250').getCell(12).value = 1.5;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'whole number'
    );
  });
  it('preserves exact batch value rather than multiplying rounded unit cost', async () => {
    const snapshot = workbookFixture();
    snapshot.stock[0].value = 1400;
    snapshot.stock[0].quantity = 97;
    snapshot.stock[0].batch = {
      ...snapshot.stock[0].batch!,
      remaining: 97,
      remaining_cost: 1400,
      unit_cost: 14,
    };
    const book = await exportProductWorkbook(snapshot);
    expect(bySku(book, 'SOAP250').getCell(24).value).toBe(1400);
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).changes.batches).toEqual([]);
    bySku(book, 'SOAP250').getCell(27).value = 1450;
    const p = readProductWorkbook(book, 'Products.xlsx', snapshot);
    expect(p.errors).toEqual([]);
    expect(p.changes.batches[0].new_remaining_cost).toBe(1450);
  });
  it('rejects unsupported input formulas and edits to current values', async () => {
    const { snapshot, book } = await setup();
    bySku(book, 'SOAP250').getCell(6).value = { formula: '1+1', result: 2 };
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'unsupported formula'
    );
    bySku(book, 'SOAP250').getCell(6).value = null;
    bySku(book, 'SOAP250').getCell(5).value = 55;
    expect(readProductWorkbook(book, 'Products.xlsx', snapshot).errors.join()).toContain(
      'Retail now is a reference'
    );
  });
  it('detects changed prices, manufacturer records and stock before apply', async () => {
    const { snapshot, book } = await setup();
    bySku(book, 'SOAP250').getCell(12).value = 40;
    const live = structuredClone(snapshot);
    live.stock[0].quantity = 47;
    live.variants[0].updated_at = '2026-09-16T10:00:00Z';
    const p = readProductWorkbook(book, 'Products.xlsx', live);
    expect(p.conflicts.length).toBeGreaterThanOrEqual(2);
  });
  it('supports purchase-only packs and protects financial inputs', async () => {
    const { snapshot, book } = await setup();
    packRow(book).getCell(6).value = 'CLEAR';
    expect(
      readProductWorkbook(book, 'Products.xlsx', snapshot).changes.products[0].variants[0].packs[0]
        .sale_price
    ).toBeNull();
    const live = structuredClone(snapshot);
    live.capabilities.financial = false;
    bySku(book, 'SOAP250').getCell(10).value = 35;
    expect(readProductWorkbook(book, 'Products.xlsx', live).errors.join()).toContain(
      'financial permissions'
    );
  });
});
