import type { Workbook, Worksheet } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  ProductTransferService,
  type CatalogImportPreview,
  type CatalogPriceUpdatePreview,
} from './product-transfer.service';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const VARIANT_ID_2 = '22222222-2222-4222-8222-222222222223';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const MANUFACTURER_ID = '44444444-4444-4444-8444-444444444444';
const UPDATED_AT = '2026-08-19T08:00:00.000Z';
const LOCATION_ID = '55555555-5555-4555-8555-555555555555';

type ExportRow = {
  variant_id: string;
  variant_updated_at: string;
  product_id: string;
  product_updated_at: string;
  product_barcode: string | null;
  product_name: string;
  manufacturer_name: string | null;
  variant_name: string;
  sku: string;
  barcode: string | null;
  kind: string;
  product_active: boolean;
  variant_active: boolean;
  retail_price: number;
  wholesale_price: number | null;
  stock: number;
  stock_value: number;
  track_inventory: boolean;
  allow_fractional: boolean;
  stock_location: string;
};

type TestService = {
  supabase: {
    claims: () => { company_id: string };
    client: { rpc: () => Promise<{ data: { categories: never[] }; error: null }> };
  };
  allProducts: () => Promise<Array<Record<string, unknown>>>;
  allVariants: () => Promise<Array<Record<string, unknown>>>;
  allManufacturers: () => Promise<Array<Record<string, unknown>>>;
  locations: { active: () => { id: string; code: string; name: string } };
  catalogCache: { catalog: () => Array<Record<string, unknown>> };
  baseWorkbook: (locationCodes: string[]) => Promise<Workbook>;
  previewProductCreate: (workbook: Workbook, fileName: string) => Promise<CatalogImportPreview>;
  priceUpdateWorkbook: (
    rows: ExportRow[],
    exportedAt: string,
    stockLocationId?: string,
    manufacturerNames?: string[]
  ) => Promise<Workbook>;
  previewPriceUpdate: (
    workbook: Workbook,
    fileName: string,
    metadata: Record<string, string>
  ) => Promise<CatalogPriceUpdatePreview>;
  preview: ProductTransferService['preview'];
};

function service(): TestService {
  const instance = Object.create(ProductTransferService.prototype) as TestService;
  instance.supabase = {
    claims: () => ({ company_id: COMPANY_ID }),
    client: { rpc: async () => ({ data: { categories: [] }, error: null }) },
  };
  instance.locations = { active: () => ({ id: LOCATION_ID, code: 'MAIN', name: 'Main shop' }) };
  instance.catalogCache = {
    catalog: () => [{ variant_id: VARIANT_ID, stock: 10 }],
  };
  instance.allProducts = async () => [
    {
      id: PRODUCT_ID,
      name: 'Tea',
      active: true,
      manufacturer_id: MANUFACTURER_ID,
      updated_at: UPDATED_AT,
    },
  ];
  instance.allManufacturers = async () => [{ id: MANUFACTURER_ID, name: 'Acme' }];
  instance.allVariants = async () => [
    {
      id: VARIANT_ID,
      product_id: PRODUCT_ID,
      name: '250g',
      sku: 'TEA-250',
      active: true,
      updated_at: UPDATED_AT,
      price: 100,
      wholesale_price: 80,
      track_inventory: true,
      allow_fractional: false,
      kind: 'good',
    },
    {
      id: VARIANT_ID_2,
      product_id: PRODUCT_ID,
      name: '500g',
      sku: 'TEA-500',
      active: true,
      updated_at: UPDATED_AT,
      price: 180,
      wholesale_price: 150,
      track_inventory: true,
      allow_fractional: false,
      kind: 'good',
    },
  ];
  return instance;
}

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    variant_id: VARIANT_ID,
    variant_updated_at: UPDATED_AT,
    product_id: PRODUCT_ID,
    product_updated_at: UPDATED_AT,
    product_barcode: null,
    product_name: 'Tea',
    manufacturer_name: 'Acme',
    variant_name: '250g',
    sku: 'TEA-250',
    barcode: '616000000001',
    kind: 'good',
    product_active: true,
    variant_active: true,
    retail_price: 100,
    wholesale_price: 80,
    stock: 10,
    stock_value: 500,
    track_inventory: true,
    allow_fractional: false,
    stock_location: 'MAIN — Main shop',
    ...overrides,
  };
}

const metadata = (companyId = COMPANY_ID) => ({
  format_version: '3',
  workbook_kind: 'price_update',
  company_id: companyId,
  exported_at: UPDATED_AT,
  stock_location_id: LOCATION_ID,
});

function column(sheet: Worksheet, header: string): number {
  let result = 0;
  sheet.getRow(1).eachCell((cell, index) => {
    if (cell.text === header) result = index;
  });
  if (!result) throw new Error(`Missing test column: ${header}`);
  return result;
}

function setCell(sheet: Worksheet, rowNumber: number, header: string, value: unknown): void {
  sheet.getCell(rowNumber, column(sheet, header)).value = value as never;
}

describe('price-update workbooks', () => {
  it('builds a versioned, filterable workbook with hidden identity columns', async () => {
    const workbook = await service().priceUpdateWorkbook(
      [row({ product_active: false, variant_active: false })],
      UPDATED_AT
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    const workbookMetadata = workbook.getWorksheet('_DukaRun Metadata')!;

    expect(sheet.getTable('DukaRunProductsAndStock')).toBeDefined();
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 8, ySplit: 1 });
    expect(sheet.getColumn(1).hidden).toBe(true);
    expect(sheet.getColumn(2).hidden).toBe(true);
    expect(sheet.getColumn(3).hidden).toBe(true);
    expect(sheet.getColumn(4).hidden).toBe(true);
    expect(sheet.getCell(2, column(sheet, 'product_name')).value).toBe('Tea');
    expect(sheet.getCell(2, column(sheet, 'current_manufacturer')).value).toBe('Acme');
    expect(sheet.getCell(2, column(sheet, 'stock_value_kes')).value).toBe(500);
    expect(sheet.getCell(2, column(sheet, 'new_manufacturer')).fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFFFF2CC' },
    });
    expect(sheet.getCell(2, column(sheet, 'new_manufacturer')).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['DukaRunManufacturerChoices'],
    });
    expect(sheet.getColumn(column(sheet, 'current_stock_quantity')).numFmt).toBe('#,##0.###');
    expect(workbook.getWorksheet('Reference Data')!.getCell('A3').value).toBe('Acme');
    expect(workbookMetadata.state).toBe('veryHidden');
    expect(workbookMetadata.getCell('B1').value).toBe('3');
    expect(workbookMetadata.getCell('B2').value).toBe('price_update');
    expect(workbookMetadata.getCell('B4').value).toBe(COMPANY_ID);
  });

  it('does not count the five blank starter rows against the import limit', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook(
      Array.from({ length: 9_996 }, () => row()),
      UPDATED_AT
    );

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.rows).toBe(9_996);
    expect(preview.errors.some(error => error.includes('Maximum 10000'))).toBe(false);
  });

  it('previews retail changes, wholesale clearing, and unchanged rows exactly', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 2, 'new_retail_price_kes', 120);
    setCell(sheet, 2, 'new_wholesale_price_kes', 'CLEAR');

    const preview = await instance.previewPriceUpdate(workbook, 'prices.xlsx', metadata());

    expect(preview).toMatchObject({
      rows: 1,
      unchangedRows: 0,
      retailChanges: 1,
      wholesaleChanges: 1,
      errors: [],
      conflicts: [],
    });
    expect(preview.changes[0]).toMatchObject({
      variantId: VARIANT_ID,
      currentRetailPrice: 100,
      newRetailPrice: 120,
      currentWholesalePrice: 80,
      newWholesalePrice: null,
    });

    setCell(sheet, 2, 'new_retail_price_kes', 100);
    setCell(sheet, 2, 'new_wholesale_price_kes', 80);
    const unchanged = await instance.previewPriceUpdate(workbook, 'prices.xlsx', metadata());
    expect(unchanged).toMatchObject({ unchangedRows: 1, retailChanges: 0, wholesaleChanges: 0 });
    expect(unchanged.changes).toEqual([]);
  });

  it('previews location stock changes and validates counted quantities', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 2, 'new_stock_quantity', 7);

    const preview = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());
    expect(preview).toMatchObject({ stockChanges: 1, errors: [], conflicts: [] });
    expect(preview.changes[0]).toMatchObject({
      currentStockQuantity: 10,
      newStockQuantity: 7,
      stockLocationId: LOCATION_ID,
    });

    setCell(sheet, 2, 'new_stock_quantity', 7.5);
    const fractional = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());
    expect(fractional.errors.join('\n')).toContain('does not allow fractional stock');
  });

  it('applies one product-level manufacturer choice across repeated variant rows', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook(
      [
        row(),
        row({
          variant_id: VARIANT_ID_2,
          variant_name: '500g',
          sku: 'TEA-500',
          retail_price: 180,
          wholesale_price: 150,
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme', 'New Dairy']
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 3, 'new_manufacturer', 'New Dairy');

    const preview = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());
    expect(preview).toMatchObject({
      manufacturerChanges: 1,
      unchangedRows: 1,
      errors: [],
      conflicts: [],
    });
    expect(preview.productChanges).toEqual([
      {
        productId: PRODUCT_ID,
        expectedUpdatedAt: UPDATED_AT,
        productName: 'Tea',
        currentManufacturer: 'Acme',
        newManufacturer: 'New Dairy',
      },
    ]);

    setCell(sheet, 2, 'new_manufacturer', 'Another Dairy');
    const conflicting = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());
    expect(conflicting.productChanges).toEqual([]);
    expect(conflicting.errors.join('\n')).toContain('conflicting new manufacturers on rows 2, 3');
  });

  it('treats an appended blank-ID row as a new product', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
    const sheet = workbook.getWorksheet('Products & Stock')!;
    const newRow = 3;
    setCell(sheet, newRow, 'product_key', 'NEW-COFFEE');
    setCell(sheet, newRow, 'product_name', 'Coffee');
    setCell(sheet, newRow, 'new_manufacturer', 'Roaster Co');
    setCell(sheet, newRow, 'sku', 'COFFEE-1');
    setCell(sheet, newRow, 'kind', 'good');
    setCell(sheet, newRow, 'product_active', true);
    setCell(sheet, newRow, 'variant_active', true);
    setCell(sheet, newRow, 'track_inventory', true);
    setCell(sheet, newRow, 'allow_fractional_stock', false);
    setCell(sheet, newRow, 'new_retail_price_kes', 250);
    setCell(sheet, newRow, 'new_stock_quantity', 5);
    setCell(sheet, newRow, 'stock_increase_unit_cost_kes', 100);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(preview.errors).toEqual([]);
    expect(preview.creationPreview).toMatchObject({ rows: 1, creates: 1 });
    expect(preview.creationPreview?.products[0]).toMatchObject({
      product_key: 'NEW-COFFEE',
      name: 'Coffee',
      manufacturer_name: 'Roaster Co',
      variants: [{ sku: 'COFFEE-1', price: 250, opening_quantity: 5 }],
    });
  });

  it('previews removed exported rows as disables without deleting history', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook(
      [
        row(),
        row({
          variant_id: VARIANT_ID_2,
          variant_name: '500g',
          sku: 'TEA-500',
          retail_price: 180,
          wholesale_price: 150,
        }),
      ],
      UPDATED_AT
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 2, 'product_name', '');
    const cleared = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(cleared.errors.join('\n')).toContain('delete the entire Excel table row');
    expect(cleared.disableChanges).toEqual([]);

    setCell(sheet, 2, 'product_name', 'Tea');
    sheet.spliceRows(2, 1);

    const oneRemoved = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(oneRemoved.disableChanges).toEqual([
      expect.objectContaining({
        variantId: VARIANT_ID,
        productName: 'Tea',
        variantName: '250g',
        disableProduct: false,
      }),
    ]);

    sheet.spliceRows(2, 1);
    const allRemoved = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(allRemoved.disabledVariants).toBe(2);
    expect(allRemoved.disabledProducts).toBe(1);
    expect(allRemoved.disableChanges.some(change => change.disableProduct)).toBe(true);
  });

  it('rejects decimals, formulas, Excel errors, duplicates, and stale rows', async () => {
    const instance = service();
    const invalidValues: Array<[unknown, string]> = [
      [100.5, 'whole amount'],
      [Number.MAX_SAFE_INTEGER + 1, 'whole amount'],
      [{ formula: '1+1', result: 2 }, 'Formulas are not allowed'],
      [{ error: '#VALUE!' }, 'Excel error'],
    ];
    for (const [value, message] of invalidValues) {
      const invalidWorkbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
      setCell(invalidWorkbook.getWorksheet('Products & Stock')!, 2, 'new_retail_price_kes', value);
      const invalid = await instance.previewPriceUpdate(invalidWorkbook, 'prices.xlsx', metadata());
      expect(invalid.errors.join('\n')).toContain(message);
    }

    const duplicateWorkbook = await instance.priceUpdateWorkbook(
      [row(), row({ product_name: 'Duplicate' })],
      UPDATED_AT
    );
    setCell(duplicateWorkbook.getWorksheet('Products & Stock')!, 2, 'new_retail_price_kes', 120);
    setCell(duplicateWorkbook.getWorksheet('Products & Stock')!, 3, 'new_retail_price_kes', 130);
    const duplicate = await instance.previewPriceUpdate(
      duplicateWorkbook,
      'prices.xlsx',
      metadata()
    );
    expect(duplicate.errors.join('\n')).toContain('duplicate variant_id');

    const staleWorkbook = await instance.priceUpdateWorkbook(
      [row({ variant_updated_at: '2026-08-18T08:00:00.000Z' })],
      UPDATED_AT
    );
    setCell(staleWorkbook.getWorksheet('Products & Stock')!, 2, 'new_retail_price_kes', 120);
    const stale = await instance.previewPriceUpdate(staleWorkbook, 'prices.xlsx', metadata());
    expect(stale.conflicts).toHaveLength(1);
    expect(stale.changes).toEqual([]);

    const preciseStaleWorkbook = await instance.priceUpdateWorkbook(
      [row({ variant_updated_at: '2026-08-19T08:00:00.000500Z' })],
      UPDATED_AT
    );
    setCell(preciseStaleWorkbook.getWorksheet('Products & Stock')!, 2, 'new_retail_price_kes', 120);
    const preciseStale = await instance.previewPriceUpdate(
      preciseStaleWorkbook,
      'prices.xlsx',
      metadata()
    );
    expect(preciseStale.conflicts).toHaveLength(1);

    const untouchedStaleWorkbook = await instance.priceUpdateWorkbook(
      [row({ variant_updated_at: '2026-08-18T08:00:00.000Z' })],
      UPDATED_AT
    );
    const untouchedStale = await instance.previewPriceUpdate(
      untouchedStaleWorkbook,
      'prices.xlsx',
      metadata()
    );
    expect(untouchedStale).toMatchObject({ unchangedRows: 1, conflicts: [], errors: [] });
  });

  it('rejects another company and old workbook formats', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);

    await expect(
      instance.previewPriceUpdate(workbook, 'prices.xlsx', metadata('another-company'))
    ).rejects.toThrow('different company');

    workbook.getWorksheet('_DukaRun Metadata')!.getCell('B1').value = '1';
    const bytes = await workbook.xlsx.writeBuffer();
    const file = {
      name: 'outdated.xlsx',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    } as unknown as File;
    await expect(instance.preview(file)).rejects.toThrow('outdated');
  });
});

describe('new-product workbooks', () => {
  it('accepts creation rows and rejects rows containing existing IDs', async () => {
    const instance = service();
    const workbook = await instance.baseWorkbook(['MAIN']);
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow([
      'NEW-1',
      '',
      '',
      'Coffee',
      '',
      '',
      true,
      '',
      'COFFEE-1',
      '',
      'good',
      200,
      '',
      true,
      false,
      true,
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    const preview = await instance.previewProductCreate(workbook, 'new-products.xlsx');
    expect(preview).toMatchObject({
      kind: 'product_create',
      rows: 1,
      creates: 1,
      errors: [],
    });

    sheet.getCell('B2').value = '44444444-4444-4444-8444-444444444444';
    const withId = await instance.previewProductCreate(workbook, 'new-products.xlsx');
    expect(withId.errors.join('\n')).toContain('cannot contain product or variant IDs');
  });
});
