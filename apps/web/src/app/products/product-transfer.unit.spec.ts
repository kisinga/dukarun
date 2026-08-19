import type { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  ProductTransferService,
  type CatalogImportPreview,
  type CatalogPriceUpdatePreview,
} from './product-transfer.service';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = '2026-08-19T08:00:00.000Z';

type ExportRow = {
  variant_id: string;
  variant_updated_at: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  product_active: boolean;
  variant_active: boolean;
  retail_price: number;
  wholesale_price: number | null;
};

type TestService = {
  supabase: {
    claims: () => { company_id: string };
    client: { rpc: () => Promise<{ data: { categories: never[] }; error: null }> };
  };
  allProducts: () => Promise<Array<Record<string, unknown>>>;
  allVariants: () => Promise<Array<Record<string, unknown>>>;
  baseWorkbook: (locationCodes: string[]) => Promise<Workbook>;
  previewProductCreate: (workbook: Workbook, fileName: string) => Promise<CatalogImportPreview>;
  priceUpdateWorkbook: (rows: ExportRow[], exportedAt: string) => Promise<Workbook>;
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
  instance.allProducts = async () => [];
  instance.allVariants = async () => [
    {
      id: VARIANT_ID,
      updated_at: UPDATED_AT,
      price: 100,
      wholesale_price: 80,
    },
  ];
  return instance;
}

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    variant_id: VARIANT_ID,
    variant_updated_at: UPDATED_AT,
    product_id: '33333333-3333-4333-8333-333333333333',
    product_name: 'Tea',
    variant_name: '250g',
    sku: 'TEA-250',
    product_active: true,
    variant_active: true,
    retail_price: 100,
    wholesale_price: 80,
    ...overrides,
  };
}

const metadata = (companyId = COMPANY_ID) => ({
  format_version: '2',
  workbook_kind: 'price_update',
  company_id: companyId,
  exported_at: UPDATED_AT,
});

describe('price-update workbooks', () => {
  it('builds a versioned, filterable workbook with hidden identity columns', async () => {
    const workbook = await service().priceUpdateWorkbook(
      [row({ product_active: false, variant_active: false })],
      UPDATED_AT
    );
    const sheet = workbook.getWorksheet('Price Updates')!;
    const workbookMetadata = workbook.getWorksheet('_DukaRun Metadata')!;

    expect(sheet.getTable('DukaRunPriceUpdates')).toBeDefined();
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 3, ySplit: 1 });
    expect(sheet.getColumn(1).hidden).toBe(true);
    expect(sheet.getColumn(2).hidden).toBe(true);
    expect(sheet.getCell('F2').value).toBe(false);
    expect(sheet.getCell('G2').value).toBe(false);
    expect(sheet.getCell('I2').fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFFFF2CC' },
    });
    expect(workbookMetadata.state).toBe('veryHidden');
    expect(workbookMetadata.getCell('B1').value).toBe('2');
    expect(workbookMetadata.getCell('B2').value).toBe('price_update');
    expect(workbookMetadata.getCell('B4').value).toBe(COMPANY_ID);
  });

  it('previews retail changes, wholesale clearing, and unchanged rows exactly', async () => {
    const instance = service();
    const workbook = await instance.priceUpdateWorkbook([row()], UPDATED_AT);
    const sheet = workbook.getWorksheet('Price Updates')!;
    sheet.getCell('I2').value = 120;
    sheet.getCell('K2').value = 'CLEAR';

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

    sheet.getCell('I2').value = 100;
    sheet.getCell('K2').value = 80;
    const unchanged = await instance.previewPriceUpdate(workbook, 'prices.xlsx', metadata());
    expect(unchanged).toMatchObject({ unchangedRows: 1, retailChanges: 0, wholesaleChanges: 0 });
    expect(unchanged.changes).toEqual([]);
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
      invalidWorkbook.getWorksheet('Price Updates')!.getCell('I2').value = value as never;
      const invalid = await instance.previewPriceUpdate(invalidWorkbook, 'prices.xlsx', metadata());
      expect(invalid.errors.join('\n')).toContain(message);
    }

    const duplicateWorkbook = await instance.priceUpdateWorkbook(
      [row(), row({ product_name: 'Duplicate' })],
      UPDATED_AT
    );
    duplicateWorkbook.getWorksheet('Price Updates')!.getCell('I2').value = 120;
    duplicateWorkbook.getWorksheet('Price Updates')!.getCell('I3').value = 130;
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
    staleWorkbook.getWorksheet('Price Updates')!.getCell('I2').value = 120;
    const stale = await instance.previewPriceUpdate(staleWorkbook, 'prices.xlsx', metadata());
    expect(stale.conflicts).toHaveLength(1);
    expect(stale.changes).toEqual([]);

    const preciseStaleWorkbook = await instance.priceUpdateWorkbook(
      [row({ variant_updated_at: '2026-08-19T08:00:00.000500Z' })],
      UPDATED_AT
    );
    preciseStaleWorkbook.getWorksheet('Price Updates')!.getCell('I2').value = 120;
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
