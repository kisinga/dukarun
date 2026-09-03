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
const BATCH_ID = '66666666-6666-4666-8666-666666666666';
const OLDER_BATCH_ID = '66666666-6666-4666-8666-666666666667';

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
  latest_batch_id: string | null;
  latest_batch_label: string | null;
  latest_batch_unit_cost: number | null;
  latest_batch_number: string | null;
  latest_batch_expiry_date: string | null;
};

type BatchRow = {
  id: string;
  variant_id: string;
  stock_location_id: string;
  batch_number: string | null;
  purchased_at: string;
  created_at: string;
  quantity: number;
  remaining: number;
  unit_cost: number;
  original_cost: number;
  remaining_cost: number;
  expiry_date: string | null;
  product_name: string;
  manufacturer_name: string | null;
  variant_name: string;
  sku: string;
  label: string;
  latest: boolean;
};

type TestService = {
  supabase: {
    claims: () => { company_id: string };
    client: { rpc: () => Promise<{ data: { categories: never[] }; error: null }> };
  };
  allProducts: () => Promise<Array<Record<string, unknown>>>;
  allVariants: () => Promise<Array<Record<string, unknown>>>;
  allManufacturers: () => Promise<Array<Record<string, unknown>>>;
  allOpenBatches: () => Promise<BatchRow[]>;
  locations: { active: () => { id: string; code: string; name: string } };
  permissions: { has: () => boolean };
  catalogCache: { catalog: () => Array<Record<string, unknown>> };
  previewProductCreate: (workbook: Workbook, fileName: string) => Promise<CatalogImportPreview>;
  priceUpdateWorkbook: (
    rows: ExportRow[],
    exportedAt: string,
    stockLocationId?: string,
    manufacturerNames?: string[],
    batchRows?: BatchRow[]
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
  instance.permissions = { has: () => true };
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
  instance.allManufacturers = async () => [{ id: MANUFACTURER_ID, name: 'Acme', active: true }];
  instance.allOpenBatches = async () => [];
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
    latest_batch_id: null,
    latest_batch_label: null,
    latest_batch_unit_cost: null,
    latest_batch_number: null,
    latest_batch_expiry_date: null,
    ...overrides,
  };
}

function batch(overrides: Partial<BatchRow> = {}): BatchRow {
  return {
    id: BATCH_ID,
    variant_id: VARIANT_ID,
    stock_location_id: LOCATION_ID,
    batch_number: 'PO-104',
    purchased_at: '2026-08-18T08:00:00.000Z',
    created_at: '2026-08-18T08:00:00.000Z',
    quantity: 10,
    remaining: 6,
    unit_cost: 0,
    original_cost: 0,
    remaining_cost: 0,
    expiry_date: null,
    product_name: 'Tea',
    manufacturer_name: 'Acme',
    variant_name: '250g',
    sku: 'TEA-250',
    label: 'PO-104 · received 2026-08-18',
    latest: true,
    ...overrides,
  };
}

const metadata = (companyId = COMPANY_ID) => ({
  format_version: '5',
  workbook_kind: 'catalog_workbook',
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

describe('catalog workbooks', () => {
  it('builds a versioned, filterable workbook with hidden identity columns', async () => {
    const workbook = await service().priceUpdateWorkbook(
      [
        row({
          product_active: false,
          variant_active: false,
          latest_batch_id: BATCH_ID,
          latest_batch_label: 'PO-104 · received 2026-08-18',
          latest_batch_unit_cost: 0,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme'],
      [batch()]
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    const workbookMetadata = workbook.getWorksheet('_DukaRun Metadata')!;

    expect(sheet.getTable('DukaRunProductsAndStock')).toBeDefined();
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 13, ySplit: 1 });
    expect(sheet.getColumn(1).hidden).toBe(true);
    expect(sheet.getColumn(2).hidden).toBe(true);
    expect(sheet.getColumn(3).hidden).toBe(true);
    expect(sheet.getColumn(4).hidden).toBe(true);
    expect(sheet.getCell(2, column(sheet, 'product_name')).value).toBe('Tea');
    expect(sheet.getCell(2, column(sheet, 'manufacturer')).value).toBe('Acme');
    expect(sheet.getCell(2, column(sheet, 'stock_value_kes')).value).toBe(500);
    expect(sheet.getCell(2, column(sheet, 'latest_batch')).value).toMatchObject({
      text: 'PO-104 · received 2026-08-18',
      hyperlink: "#'Batches'!K2",
    });
    expect(sheet.getCell(2, column(sheet, 'latest_buying_price_kes')).value).toBe(0);
    expect(sheet.getCell(2, column(sheet, 'latest_buying_price_kes')).fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFF4CCCC' },
    });
    expect(sheet.getCell(2, column(sheet, 'manufacturer')).fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFFFF2CC' },
    });
    expect(sheet.getCell(2, column(sheet, 'manufacturer')).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['DukaRunManufacturerChoices'],
    });
    expect(sheet.getColumn(column(sheet, 'current_stock_quantity')).numFmt).toBe('#,##0.###');
    expect(workbook.getWorksheet('Manufacturers')!.getCell('A3').value).toBe('Acme');
    expect(workbookMetadata.state).toBe('veryHidden');
    expect(workbook.getWorksheet('Batches')!.getCell('K2').value).toBe('Tea');
    expect(workbook.getWorksheet('Batches')!.getCell('L2').value).toBe('Acme');
    expect(workbook.getWorksheet('Batches')!.getCell('M2').value).toBe('250g');
    expect(workbook.getWorksheet('Batches')!.getCell('S2').value).toMatchObject({
      formula: expect.stringContaining('Products & Stock'),
    });
    expect(workbook.getWorksheet('Batches')!.getCell('S2').fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFF4CCCC' },
    });
    expect(workbook.getWorksheet('Batches')!.getCell('S2').note).toContain(
      'Linked to Products & Stock'
    );
    expect(workbookMetadata.getCell('B1').value).toBe('5');
    expect(workbookMetadata.getCell('B2').value).toBe('catalog_workbook');
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

  it('previews intentional corrections for open batches and ignores deleted batch rows', async () => {
    const instance = service();
    const currentBatch = batch();
    const olderBatch = batch({
      id: OLDER_BATCH_ID,
      batch_number: null,
      purchased_at: '2026-08-01T08:00:00.000Z',
      created_at: '2026-08-01T08:00:00.000Z',
      remaining: 2,
      unit_cost: 40,
      original_cost: 400,
      remaining_cost: 80,
      label: 'Received 2026-08-01',
      latest: false,
    });
    instance.allOpenBatches = async () => [currentBatch, olderBatch];
    const workbook = await instance.priceUpdateWorkbook(
      [
        row({
          latest_batch_id: BATCH_ID,
          latest_batch_label: currentBatch.label,
          latest_batch_unit_cost: 0,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme'],
      [currentBatch, olderBatch]
    );
    const mainSheet = workbook.getWorksheet('Products & Stock')!;
    setCell(mainSheet, 2, 'latest_buying_price_kes', 55);
    setCell(mainSheet, 2, 'latest_batch_number', 'COUNT-104');
    workbook.getWorksheet('Batches')!.spliceRows(3, 1);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.errors).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.batchChanges).toEqual([
      expect.objectContaining({
        action: 'update',
        batchId: BATCH_ID,
        productName: 'Tea',
        variantName: '250g',
        expectedRemaining: 6,
        currentUnitCost: 0,
        newUnitCost: 55,
        newBatchNumber: 'COUNT-104',
        newRemainingCost: 330,
        valueDifference: 330,
      }),
    ]);
  });

  it('links a stock increase to the existing latest batch', async () => {
    const instance = service();
    const currentBatch = batch();
    instance.allOpenBatches = async () => [currentBatch];
    const workbook = await instance.priceUpdateWorkbook(
      [
        row({
          latest_batch_id: BATCH_ID,
          latest_batch_label: currentBatch.label,
          latest_batch_unit_cost: 0,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme'],
      [currentBatch]
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 2, 'new_stock_quantity', 12);
    setCell(sheet, 2, 'latest_buying_price_kes', 50);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.errors).toEqual([]);
    expect(preview.batchChanges).toEqual([
      expect.objectContaining({
        action: 'update',
        batchId: BATCH_ID,
        latest: true,
        quantityAdded: 2,
        newUnitCost: 50,
        newRemainingCost: 400,
      }),
    ]);
  });

  it('creates a latest batch only when a stock increase has no open batch', async () => {
    const instance = service();
    instance.catalogCache = { catalog: () => [{ variant_id: VARIANT_ID, stock: 0 }] };
    const workbook = await instance.priceUpdateWorkbook(
      [row({ stock: 0, stock_value: 0 })],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme']
    );
    const sheet = workbook.getWorksheet('Products & Stock')!;
    setCell(sheet, 2, 'new_stock_quantity', 3);
    setCell(sheet, 2, 'latest_batch_number', 'COUNT-1');
    setCell(sheet, 2, 'latest_buying_price_kes', 75);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.errors).toEqual([]);
    expect(preview.batchChanges).toEqual([
      expect.objectContaining({
        action: 'create',
        batchId: null,
        latest: true,
        quantityAdded: 3,
        newBatchNumber: 'COUNT-1',
        newUnitCost: 75,
      }),
    ]);

    setCell(sheet, 2, 'new_stock_quantity', '');
    const withoutStock = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(withoutStock.batchChanges).toEqual([]);
    expect(withoutStock.errors.join('\n')).toContain(
      'latest batch details require a stock increase'
    );
  });

  it('edits an older open batch only from the Batches sheet', async () => {
    const instance = service();
    const currentBatch = batch({ unit_cost: 50, original_cost: 500, remaining_cost: 300 });
    const olderBatch = batch({
      id: OLDER_BATCH_ID,
      batch_number: 'OLD-1',
      purchased_at: '2026-08-01T08:00:00.000Z',
      created_at: '2026-08-01T08:00:00.000Z',
      remaining: 2,
      unit_cost: 40,
      original_cost: 400,
      remaining_cost: 80,
      label: 'OLD-1 · received 2026-08-01',
      latest: false,
    });
    instance.allOpenBatches = async () => [currentBatch, olderBatch];
    const workbook = await instance.priceUpdateWorkbook(
      [
        row({
          latest_batch_id: BATCH_ID,
          latest_batch_label: currentBatch.label,
          latest_batch_unit_cost: 50,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      ['Acme'],
      [currentBatch, olderBatch]
    );
    const batchSheet = workbook.getWorksheet('Batches')!;
    setCell(batchSheet, 3, 'batch_number', 'OLD-CORRECTED');
    setCell(batchSheet, 3, 'buying_price_kes', 45);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.errors).toEqual([]);
    expect(preview.batchChanges).toEqual([
      expect.objectContaining({
        batchId: OLDER_BATCH_ID,
        latest: false,
        newBatchNumber: 'OLD-CORRECTED',
        newUnitCost: 45,
      }),
    ]);
  });

  it('rejects a batch correction when that batch is exhausted after export', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook(
      [
        row({
          latest_batch_id: BATCH_ID,
          latest_batch_label: 'PO-104 · received 2026-08-18',
          latest_batch_unit_cost: 0,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      [],
      [batch()]
    );
    setCell(workbook.getWorksheet('Products & Stock')!, 2, 'latest_buying_price_kes', 55);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.batchChanges).toEqual([]);
    expect(preview.conflicts.join('\n')).toContain('exhausted or no longer exists');
  });

  it('does not preview batch costs without stock-adjustment and financial access', async () => {
    const instance = service();
    instance.permissions = { has: () => false };
    const workbook = await instance.priceUpdateWorkbook(
      [
        row({
          latest_batch_id: BATCH_ID,
          latest_batch_label: 'PO-104 · received 2026-08-18',
          latest_batch_unit_cost: 0,
          latest_batch_number: 'PO-104',
        }),
      ],
      UPDATED_AT,
      LOCATION_ID,
      [],
      [batch()]
    );
    setCell(workbook.getWorksheet('Products & Stock')!, 2, 'latest_buying_price_kes', 55);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());

    expect(preview.batchChanges).toEqual([]);
    expect(preview.errors.join('\n')).toContain('require stock-adjustment and financial access');
  });

  it('applies one product-level manufacturer choice across repeated variant rows', async () => {
    const instance = service();
    instance.allManufacturers = async () => [
      { id: MANUFACTURER_ID, name: 'Acme', active: true },
      { id: '44444444-4444-4444-8444-444444444445', name: 'New Dairy', active: true },
      { id: '44444444-4444-4444-8444-444444444446', name: 'Another Dairy', active: true },
    ];
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
    setCell(sheet, 3, 'manufacturer', 'New Dairy');

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

    setCell(sheet, 2, 'manufacturer', 'Another Dairy');
    const conflicting = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());
    expect(conflicting.productChanges).toEqual([]);
    expect(conflicting.errors.join('\n')).toContain('conflicting new manufacturers on rows 2, 3');

    const pastedWorkbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
    setCell(pastedWorkbook.getWorksheet('Products & Stock')!, 2, 'manufacturer', 'Made Up Co');
    const pasted = await instance.previewPriceUpdate(pastedWorkbook, 'updates.xlsx', metadata());
    expect(pasted.errors.join('\n')).toContain(
      'manufacturer must be selected from the Manufacturers sheet'
    );
  });

  it('allows an assigned inactive manufacturer to remain unchanged', async () => {
    const instance = service();
    instance.allManufacturers = async () => [{ id: MANUFACTURER_ID, name: 'Acme', active: false }];
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT, LOCATION_ID, ['Acme']);
    setCell(workbook.getWorksheet('Products & Stock')!, 2, 'new_retail_price_kes', 125);

    const preview = await instance.previewPriceUpdate(workbook, 'updates.xlsx', metadata());

    expect(preview.errors).toEqual([]);
    expect(preview.productChanges).toEqual([]);
    expect(preview.retailChanges).toBe(1);
  });

  it('treats an appended blank-ID row as a new product', async () => {
    const instance = service();
    instance.allManufacturers = async () => [
      { id: MANUFACTURER_ID, name: 'Acme', active: true },
      { id: '44444444-4444-4444-8444-444444444447', name: 'Roaster Co', active: true },
    ];
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT, LOCATION_ID, [
      'Acme',
      'Roaster Co',
    ]);
    const sheet = workbook.getWorksheet('Products & Stock')!;
    const newRow = 3;
    setCell(sheet, newRow, 'product_key', 'NEW-COFFEE');
    setCell(sheet, newRow, 'product_name', 'Coffee');
    setCell(sheet, newRow, 'manufacturer', 'Roaster Co');
    setCell(sheet, newRow, 'sku', 'COFFEE-1');
    setCell(sheet, newRow, 'kind', 'good');
    setCell(sheet, newRow, 'product_active', true);
    setCell(sheet, newRow, 'variant_active', true);
    setCell(sheet, newRow, 'track_inventory', true);
    setCell(sheet, newRow, 'allow_fractional_stock', false);
    setCell(sheet, newRow, 'new_retail_price_kes', 250);
    setCell(sheet, newRow, 'new_stock_quantity', 5);
    setCell(sheet, newRow, 'latest_buying_price_kes', 100);

    const preview = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(preview.errors).toEqual([]);
    expect(preview.creationPreview).toMatchObject({ rows: 1, creates: 1 });
    expect(preview.creationPreview?.products[0]).toMatchObject({
      product_key: 'NEW-COFFEE',
      name: 'Coffee',
      manufacturer_name: 'Roaster Co',
      variants: [{ sku: 'COFFEE-1', price: 250, opening_quantity: 5 }],
    });

    setCell(sheet, newRow, 'latest_buying_price_kes', 0);
    const zeroCost = await instance.previewPriceUpdate(workbook, 'catalog.xlsx', metadata());
    expect(zeroCost.errors.join('\n')).toContain('opening unit cost must be greater than zero');
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
