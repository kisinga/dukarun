import { Injectable, inject } from '@angular/core';
import { Workbook, type Cell, type Worksheet } from 'exceljs';
import { SupabaseService } from '../core/supabase.service';

export type ProductImportMode = 'merge' | 'replace';

export interface CatalogImportVariant {
  variant_id?: string;
  name?: string;
  sku?: string;
  barcode?: string | null;
  kind: 'good' | 'service';
  price: number;
  wholesale_price?: number | null;
  track_inventory: boolean;
  allow_fractional: boolean;
  active: boolean;
  opening_quantity?: number;
  opening_unit_cost?: number;
  opening_location_id?: string;
  batch_number?: string;
  expiry_date?: string;
}

export interface CatalogImportProduct {
  product_key: string;
  product_id?: string;
  name: string;
  manufacturer_name?: string;
  barcode?: string | null;
  active: boolean;
  variants: CatalogImportVariant[];
}

export interface CatalogImportPreview {
  idempotencyKey: string;
  fileName: string;
  products: CatalogImportProduct[];
  rows: number;
  creates: number;
  updates: number;
  replaceEligible: boolean;
  exportId: string | null;
  exportedAt: string | null;
  missingProducts: number;
  missingVariants: number;
  errors: string[];
}

export interface CatalogImportResult {
  status: 'completed' | 'failed';
  import_id: string;
  mode: ProductImportMode;
  created?: number;
  updated?: number;
  deactivated_products?: number;
  deactivated_variants?: number;
  error?: string;
}

const HEADERS = [
  'product_key',
  'product_id',
  'variant_id',
  'product_name',
  'manufacturer',
  'product_barcode',
  'product_active',
  'variant_name',
  'sku',
  'variant_barcode',
  'kind',
  'retail_price_kes',
  'wholesale_price_kes',
  'track_inventory',
  'allow_fractional',
  'variant_active',
  'opening_quantity',
  'opening_unit_cost_kes',
  'stock_location_code',
  'batch_number',
  'expiry_date',
] as const;

type Header = (typeof HEADERS)[number];
type RowValues = Record<Header, unknown>;
type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  active: boolean;
  manufacturer_id: string | null;
  created_at: string;
};
type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  barcode: string | null;
  kind: string;
  price: number;
  wholesale_price: number | null;
  track_inventory: boolean;
  allow_fractional: boolean;
  active: boolean;
  created_at: string;
};

// PostgreSQL's uuid type accepts any canonical 8-4-4-4-12 hexadecimal value,
// including legacy IDs without RFC version/variant bits.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 5_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class ProductTransferService {
  private readonly supabase = inject(SupabaseService);

  async exportCatalog(): Promise<void> {
    const marker = await this.startCatalogExport();
    const [products, variants, manufacturers, locations] = await Promise.all([
      this.allProducts(),
      this.allVariants(),
      this.allManufacturers(),
      this.allLocations(),
    ]);
    const manufacturerNames = new Map(manufacturers.map(item => [item.id, item.name]));
    const exportedAt = marker.exportedAt;
    const workbook = this.baseWorkbook(locations.map(item => item.code));
    const sheet = workbook.getWorksheet('Products')!;

    for (const product of products) {
      const familyVariants = variants.filter(variant => variant.product_id === product.id);
      for (const variant of familyVariants) {
        sheet.addRow([
          product.id,
          product.id,
          variant.id,
          product.name,
          product.manufacturer_id ? (manufacturerNames.get(product.manufacturer_id) ?? '') : '',
          product.barcode ?? '',
          product.active,
          variant.name === 'Default' ? '' : variant.name,
          variant.sku,
          variant.barcode ?? '',
          variant.kind,
          variant.price,
          variant.wholesale_price ?? '',
          variant.track_inventory,
          variant.allow_fractional,
          variant.active,
          '',
          '',
          '',
          '',
          '',
        ]);
      }
    }

    this.addMetadata(workbook, exportedAt, 'full', marker.exportId);
    this.finishProductsSheet(sheet);
    await this.download(workbook, `dukarun-products-${exportedAt.slice(0, 10)}.xlsx`);
  }

  async downloadTemplate(): Promise<void> {
    const locations = await this.allLocations();
    const workbook = this.baseWorkbook(locations.map(item => item.code));
    const sheet = workbook.getWorksheet('Products')!;
    sheet.addRow([
      'NEW-001',
      '',
      '',
      'Sample product',
      '',
      '',
      true,
      '',
      'SAMPLE-001',
      '',
      'good',
      100,
      '',
      true,
      false,
      true,
      10,
      60,
      locations[0]?.code ?? 'MAIN',
      '',
      '',
    ]);
    this.addMetadata(workbook, new Date().toISOString(), 'template');
    this.finishProductsSheet(sheet);
    await this.download(workbook, 'dukarun-product-import-template.xlsx');
  }

  async preview(file: File): Promise<CatalogImportPreview> {
    if (file.size > MAX_FILE_BYTES) throw new Error('Workbook must be 10 MB or smaller.');
    const workbook = new Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.getWorksheet('Products');
    if (!sheet) throw new Error('Workbook needs a Products sheet.');
    if (sheet.actualRowCount < 2) throw new Error('Products sheet has no data rows.');
    if (sheet.actualRowCount - 1 > MAX_ROWS)
      throw new Error(`Maximum ${MAX_ROWS} rows per import.`);

    const headerMap = this.headerMap(sheet);
    const errors: string[] = [];
    const groups = new Map<string, { product: CatalogImportProduct; signature: string }>();
    const seenVariantIds = new Set<string>();
    const seenSkus = new Set<string>();
    let parsedRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = Object.fromEntries(
        HEADERS.map(header => [header, this.rawCell(row.getCell(headerMap.get(header)!))])
      ) as RowValues;
      if (Object.values(values).every(value => value === null || value === '')) return;
      parsedRows++;
      try {
        const productId = this.optionalUuid(values.product_id, 'product_id');
        const variantId = this.optionalUuid(values.variant_id, 'variant_id');
        const productKey = this.text(values.product_key) || productId;
        if (!productKey) throw new Error('product_key required for new products');
        if (!productId && variantId) throw new Error('variant_id cannot be set without product_id');
        if (variantId && seenVariantIds.has(variantId)) throw new Error('duplicate variant_id');
        if (variantId) seenVariantIds.add(variantId);

        const name = this.requiredText(values.product_name, 'product_name');
        const manufacturer = this.text(values.manufacturer);
        const barcode = this.text(values.product_barcode);
        const active = this.bool(values.product_active, true, 'product_active');
        const signature = JSON.stringify({ productId, name, manufacturer, barcode, active });
        let group = groups.get(productKey);
        if (!group) {
          group = {
            signature,
            product: {
              product_key: productKey,
              ...(productId ? { product_id: productId } : {}),
              name,
              ...(manufacturer ? { manufacturer_name: manufacturer } : {}),
              barcode: barcode || null,
              active,
              variants: [],
            },
          };
          groups.set(productKey, group);
        } else if (group.signature !== signature) {
          throw new Error(`product fields differ from other ${productKey} rows`);
        }

        const sku = this.text(values.sku);
        const normalizedSku = sku.toLocaleUpperCase();
        if (sku && seenSkus.has(normalizedSku)) throw new Error(`duplicate SKU ${sku}`);
        if (sku) seenSkus.add(normalizedSku);
        const kind = (this.text(values.kind) || 'good') as 'good' | 'service';
        if (!['good', 'service'].includes(kind)) throw new Error('kind must be good or service');
        const openingQuantity = this.optionalNumber(values.opening_quantity, 'opening_quantity');
        const openingUnitCost = this.optionalMoney(
          values.opening_unit_cost_kes,
          'opening_unit_cost_kes'
        );
        const allowFractional =
          kind === 'service'
            ? false
            : this.bool(values.allow_fractional, false, 'allow_fractional');
        const trackInventory =
          kind === 'service' ? false : this.bool(values.track_inventory, true, 'track_inventory');
        if (variantId && openingQuantity)
          throw new Error('opening stock allowed only for new variants');
        if (openingQuantity < 0) throw new Error('opening quantity cannot be negative');
        if (openingQuantity > 0 && !trackInventory)
          throw new Error('opening stock requires tracking');
        if (openingQuantity > 0 && !allowFractional && !Number.isInteger(openingQuantity)) {
          throw new Error('fractional opening quantity not allowed');
        }
        if (openingQuantity > 0 && openingUnitCost === null) {
          throw new Error('opening unit cost required');
        }

        group.product.variants.push({
          ...(variantId ? { variant_id: variantId } : {}),
          ...(this.text(values.variant_name) ? { name: this.text(values.variant_name) } : {}),
          ...(sku ? { sku } : {}),
          barcode: this.text(values.variant_barcode) || null,
          kind,
          price: this.money(values.retail_price_kes, 'retail_price_kes'),
          wholesale_price: this.optionalMoney(values.wholesale_price_kes, 'wholesale_price_kes'),
          track_inventory: trackInventory,
          allow_fractional: allowFractional,
          active: this.bool(values.variant_active, true, 'variant_active'),
          ...(openingQuantity > 0
            ? {
                opening_quantity: openingQuantity,
                opening_unit_cost: openingUnitCost!,
                ...(this.text(values.stock_location_code)
                  ? { opening_location_id: this.text(values.stock_location_code) }
                  : {}),
                ...(this.text(values.batch_number)
                  ? { batch_number: this.text(values.batch_number) }
                  : {}),
                ...(this.date(values.expiry_date)
                  ? { expiry_date: this.date(values.expiry_date)! }
                  : {}),
              }
            : {}),
        });
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`);
      }
    });

    const products = [...groups.values()].map(group => group.product);
    for (const product of products) {
      const labels = product.variants
        .map(variant => variant.name?.trim().toLocaleLowerCase())
        .filter((label): label is string => !!label);
      if (new Set(labels).size !== labels.length) {
        errors.push(`${product.product_key}: duplicate variant names`);
      }
    }
    const metadata = this.readMetadata(workbook);
    const companyId = this.supabase.claims()?.company_id ?? '';
    const replaceEligible =
      metadata['export_type'] === 'full' &&
      metadata['company_id'] === companyId &&
      UUID.test(metadata['export_id'] ?? '') &&
      !!metadata['exported_at'];
    const [currentProducts, currentVariants] = await Promise.all([
      this.allProducts(),
      this.allVariants(),
    ]);
    const productIds = new Set(
      products.flatMap(product => (product.product_id ? [product.product_id] : []))
    );
    const variantIds = new Set(
      products.flatMap(product =>
        product.variants.flatMap(variant => (variant.variant_id ? [variant.variant_id] : []))
      )
    );
    const exportedAtMs = metadata['exported_at'] ? Date.parse(metadata['exported_at']) : 0;
    const existedAtExport = (createdAt: string) =>
      !exportedAtMs || Date.parse(createdAt) <= exportedAtMs;

    return {
      idempotencyKey: crypto.randomUUID(),
      fileName: file.name,
      products,
      rows: parsedRows,
      creates: products.filter(product => !product.product_id).length,
      updates: products.filter(product => !!product.product_id).length,
      replaceEligible,
      exportId: metadata['export_id'] || null,
      exportedAt: metadata['exported_at'] || null,
      missingProducts: currentProducts.filter(
        product =>
          product.active && existedAtExport(product.created_at) && !productIds.has(product.id)
      ).length,
      missingVariants: currentVariants.filter(
        variant =>
          variant.active && existedAtExport(variant.created_at) && !variantIds.has(variant.id)
      ).length,
      errors,
    };
  }

  async apply(
    preview: CatalogImportPreview,
    mode: ProductImportMode
  ): Promise<CatalogImportResult> {
    if (preview.errors.length) throw new Error('Fix workbook errors before importing.');
    if (mode === 'replace' && !preview.replaceEligible) {
      throw new Error('Replace requires a full catalog export from this company.');
    }
    const locationIds = new Map((await this.allLocations()).map(item => [item.code, item.id]));
    const products = preview.products.map(product => ({
      ...product,
      variants: product.variants.map(variant => ({
        ...variant,
        ...(variant.opening_location_id
          ? { opening_location_id: this.locationId(locationIds, variant.opening_location_id) }
          : {}),
      })),
    }));
    const { data, error } = await this.supabase.client.rpc('import_catalog_products', {
      p_products: products as never,
      p_mode: mode,
      p_idempotency_key: preview.idempotencyKey,
      p_source_export_id: mode === 'replace' ? preview.exportId! : undefined,
    });
    if (error) throw error;
    const result = data as unknown as CatalogImportResult;
    if (result.status === 'failed') throw new Error(result.error ?? 'Import failed');
    return result;
  }

  private baseWorkbook(locationCodes: string[]): Workbook {
    const workbook = new Workbook();
    workbook.creator = 'DukaRun';
    workbook.created = new Date();
    const products = workbook.addWorksheet('Products', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { tabColor: { argb: '1F4E78' } },
    });
    products.addRow([...HEADERS]);
    products.columns = HEADERS.map(header => ({
      key: header,
      width: header.includes('id') ? 38 : Math.max(14, Math.min(24, header.length + 3)),
    }));
    const instructions = workbook.addWorksheet('Instructions', {
      properties: { tabColor: { argb: '70AD47' } },
    });
    instructions.columns = [{ width: 24 }, { width: 100 }];
    [
      ['Rule', 'Details'],
      [
        'Rows',
        'Each Products row is one sellable variant. Repeat product fields for its variants.',
      ],
      ['New products', 'Leave IDs blank and group variants with the same product_key.'],
      ['Updates', 'Use IDs from a DukaRun export. Never invent IDs.'],
      ['Merge', 'Creates and updates supplied rows. Omitted catalog items stay unchanged.'],
      [
        'Replace',
        'Only full exports qualify. Omitted catalog items become inactive, never deleted.',
      ],
      [
        'Stock',
        'Opening stock is allowed only for new variants. Adjust existing stock separately.',
      ],
      ['Services', 'Services cannot track inventory or carry opening stock.'],
    ].forEach(row => instructions.addRow(row));

    const refs = workbook.addWorksheet('Reference Data', {
      properties: { tabColor: { argb: 'FFC000' } },
    });
    refs.addRow(['Boolean values', 'Product kinds', 'Stock location codes']);
    const count = Math.max(2, locationCodes.length);
    for (let index = 0; index < count; index++) {
      refs.addRow([
        ['true', 'false'][index] ?? '',
        ['good', 'service'][index] ?? '',
        locationCodes[index] ?? '',
      ]);
    }
    return workbook;
  }

  private finishProductsSheet(sheet: Worksheet): void {
    sheet.autoFilter = { from: 'A1', to: `U${Math.max(2, sheet.rowCount)}` };
    sheet.getRow(1).height = 32;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    for (let column = 1; column <= 3; column++) {
      sheet.getCell(1, column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF666666' },
      };
    }
    for (let row = 2; row <= Math.max(sheet.rowCount, MAX_ROWS + 1); row++) {
      for (const column of [7, 14, 15, 16]) {
        sheet.getCell(row, column).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"true,false"'],
        };
      }
      sheet.getCell(row, 11).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"good,service"'],
      };
    }
    for (let row = 2; row <= sheet.rowCount; row++) {
      sheet.getCell(row, 12).numFmt = '#,##0';
      sheet.getCell(row, 13).numFmt = '#,##0';
      sheet.getCell(row, 17).numFmt = '0.000';
      sheet.getCell(row, 18).numFmt = '#,##0';
      sheet.getCell(row, 21).numFmt = 'yyyy-mm-dd';
    }
  }

  private addMetadata(
    workbook: Workbook,
    exportedAt: string,
    exportType: 'full' | 'template',
    exportId = ''
  ): void {
    const metadata = workbook.addWorksheet('_DukaRun Metadata', { state: 'veryHidden' });
    metadata.addRows([
      ['format_version', '1'],
      ['entity', 'products'],
      ['company_id', this.supabase.claims()?.company_id ?? ''],
      ['export_id', exportId],
      ['exported_at', exportedAt],
      ['export_type', exportType],
    ]);
  }

  private readMetadata(workbook: Workbook): Record<string, string> {
    const result: Record<string, string> = {};
    workbook.getWorksheet('_DukaRun Metadata')?.eachRow(row => {
      result[String(row.getCell(1).value ?? '')] = String(row.getCell(2).value ?? '');
    });
    return result;
  }

  private headerMap(sheet: Worksheet): Map<Header, number> {
    const actual = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => actual.set(cell.text.trim(), column));
    const missing = HEADERS.filter(header => !actual.has(header));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return new Map(HEADERS.map(header => [header, actual.get(header)!]));
  }

  private rawCell(cell: Cell): unknown {
    const value = cell.value;
    if (value && typeof value === 'object' && 'formula' in value) {
      throw new Error(`Formulas are not allowed (${cell.address})`);
    }
    if (value && typeof value === 'object' && 'richText' in value) {
      return value.richText.map(part => part.text).join('');
    }
    if (value && typeof value === 'object' && 'text' in value) return value.text;
    return value;
  }

  private text(value: unknown): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private requiredText(value: unknown, name: string): string {
    const result = this.text(value);
    if (!result) throw new Error(`${name} required`);
    return result;
  }

  private optionalUuid(value: unknown, name: string): string {
    const result = this.text(value);
    if (result && !UUID.test(result)) throw new Error(`${name} must be a UUID`);
    return result;
  }

  private bool(value: unknown, defaultValue: boolean, name: string): boolean {
    if (value === null || value === undefined || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
    throw new Error(`${name} must be true or false`);
  }

  private optionalNumber(value: unknown, name: string): number {
    if (value === null || value === undefined || value === '') return 0;
    const result = Number(String(value).replaceAll(',', ''));
    if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
    return result;
  }

  private money(value: unknown, name: string): number {
    const result = this.optionalMoney(value, name);
    if (result === null) throw new Error(`${name} required`);
    return result;
  }

  private optionalMoney(value: unknown, name: string): number | null {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(String(value).replaceAll(',', ''));
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be zero or greater`);
    return Math.round(result);
  }

  private date(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime()))
      return value.toISOString().slice(0, 10);
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
      throw new Error('expiry_date must use YYYY-MM-DD');
    }
    return text;
  }

  private async allProducts(): Promise<ProductRow[]> {
    return this.allPages(offset =>
      this.supabase.client
        .from('products')
        .select('id,name,barcode,active,manufacturer_id,created_at')
        .order('id')
        .range(offset, offset + 999)
    ) as Promise<ProductRow[]>;
  }

  private async startCatalogExport(): Promise<{ exportId: string; exportedAt: string }> {
    const { data, error } = await this.supabase.client.rpc('start_catalog_export');
    if (error) throw error;
    const marker = data as { export_id?: unknown; exported_at?: unknown } | null;
    const exportId = String(marker?.export_id ?? '');
    const exportedAt = String(marker?.exported_at ?? '');
    if (!UUID.test(exportId) || Number.isNaN(Date.parse(exportedAt))) {
      throw new Error('Server returned an invalid catalog export marker.');
    }
    return { exportId, exportedAt };
  }

  private locationId(locations: Map<string, string>, code: string): string {
    const id = locations.get(code);
    if (!id) throw new Error(`Unknown stock location code: ${code}`);
    return id;
  }

  private async allVariants(): Promise<VariantRow[]> {
    return this.allPages(offset =>
      this.supabase.client
        .from('product_variants')
        .select('*')
        .order('id')
        .range(offset, offset + 999)
    ) as Promise<VariantRow[]>;
  }

  private async allManufacturers(): Promise<Array<{ id: string; name: string }>> {
    return this.allPages(offset =>
      this.supabase.client
        .from('manufacturers')
        .select('id,name')
        .order('id')
        .range(offset, offset + 999)
    ) as Promise<Array<{ id: string; name: string }>>;
  }

  private async allLocations(): Promise<Array<{ id: string; code: string }>> {
    const { data, error } = await this.supabase.client
      .from('stock_locations')
      .select('id,code')
      .order('code');
    if (error) throw error;
    return data;
  }

  private async allPages(
    request: (
      offset: number
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
  ): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let offset = 0; ; offset += 1_000) {
      const { data, error } = await request(offset);
      if (error) throw new Error(error.message);
      result.push(...(data ?? []));
      if ((data?.length ?? 0) < 1_000) return result;
    }
  }

  private async download(workbook: Workbook, filename: string): Promise<void> {
    const bytes = await workbook.xlsx.writeBuffer();
    const blob = new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
