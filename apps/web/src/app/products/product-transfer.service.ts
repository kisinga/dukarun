import { Injectable, inject } from '@angular/core';
import type { Cell, Workbook, Worksheet } from 'exceljs';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { createExcelWorkbook } from '../shared/excel-workbook';
import { SupabaseService } from '../core/supabase.service';

export interface CatalogImportVariant {
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
  name: string;
  manufacturer_name?: string;
  barcode?: string | null;
  active: boolean;
  /** Null selects the shop default. */
  tax_category_code?: string | null;
  variants: CatalogImportVariant[];
}

export interface CatalogImportPreview {
  kind: 'product_create';
  idempotencyKey: string;
  fileName: string;
  products: CatalogImportProduct[];
  rows: number;
  creates: number;
  errors: string[];
}

export interface CatalogPriceChange {
  variantId: string;
  expectedUpdatedAt: string;
  productName: string;
  variantName: string;
  currentRetailPrice: number;
  newRetailPrice?: number;
  currentWholesalePrice: number | null;
  newWholesalePrice?: number | null;
  expectedStockQuantity?: number;
  currentStockQuantity?: number;
  newStockQuantity?: number;
  stockUnitCost?: number;
  stockLocationId?: string;
  stockLocationName?: string;
}

export interface CatalogManufacturerChange {
  productId: string;
  expectedUpdatedAt: string;
  productName: string;
  currentManufacturer: string | null;
  newManufacturer: string | null;
}

export interface CatalogDisableChange {
  variantId: string;
  expectedUpdatedAt: string;
  productId: string;
  expectedProductUpdatedAt: string;
  productName: string;
  variantName: string;
  sku: string;
  disableProduct: boolean;
}

export interface CatalogPriceUpdatePreview {
  kind: 'price_update';
  fileName: string;
  rows: number;
  unchangedRows: number;
  retailChanges: number;
  wholesaleChanges: number;
  stockChanges: number;
  manufacturerChanges: number;
  changes: CatalogPriceChange[];
  productChanges: CatalogManufacturerChange[];
  creationPreview: CatalogImportPreview | null;
  disableChanges: CatalogDisableChange[];
  disabledVariants: number;
  disabledProducts: number;
  errors: string[];
  conflicts: string[];
}

export type ProductWorkbookPreview = CatalogImportPreview | CatalogPriceUpdatePreview;

export interface CatalogImportResult {
  kind: 'product_create';
  status: 'completed' | 'failed';
  import_id: string;
  mode: 'merge';
  created?: number;
  error?: string;
}

export interface CatalogPriceUpdateResult {
  kind: 'price_update';
  updated_variants: number;
  retail_changes: number;
  wholesale_changes: number;
  stock_changes: number;
  manufacturer_changes: number;
  created: number;
  disabled_variants: number;
  disabled_products: number;
}

export type ProductWorkbookResult = CatalogImportResult | CatalogPriceUpdateResult;

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
  'tax_category_code',
] as const;

const LEGACY_PRICE_UPDATE_HEADERS = [
  'variant_id',
  'variant_updated_at',
  'product_name',
  'variant_name',
  'sku',
  'product_active',
  'variant_active',
  'current_retail_price_kes',
  'new_retail_price_kes',
  'current_wholesale_price_kes',
  'new_wholesale_price_kes',
  'expected_stock_quantity',
  'stock_location',
  'track_inventory',
  'allow_fractional_stock',
  'current_stock_quantity',
  'new_stock_quantity',
  'stock_increase_unit_cost_kes',
] as const;

const PRICE_UPDATE_HEADERS = [
  'variant_id',
  'variant_updated_at',
  'product_id',
  'product_updated_at',
  'product_key',
  'product_name',
  'current_manufacturer',
  'new_manufacturer',
  'product_barcode',
  'variant_name',
  'sku',
  'barcode',
  'kind',
  'product_active',
  'variant_active',
  'current_retail_price_kes',
  'new_retail_price_kes',
  'current_wholesale_price_kes',
  'new_wholesale_price_kes',
  'expected_stock_quantity',
  'stock_location',
  'track_inventory',
  'allow_fractional_stock',
  'current_stock_quantity',
  'new_stock_quantity',
  'stock_value_kes',
  'stock_increase_unit_cost_kes',
  'batch_number',
  'expiry_date',
  'tax_category_code',
] as const;

type Header = (typeof HEADERS)[number];
type PriceUpdateHeader = (typeof PRICE_UPDATE_HEADERS)[number];
type RowValues = Record<Header, unknown>;
type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  active: boolean;
  manufacturer_id: string | null;
  tax_category_id: string | null;
  created_at: string;
  updated_at: string;
};
type ManufacturerRow = { id: string; name: string };
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
  updated_at: string;
};

// PostgreSQL accepts canonical UUIDs without requiring particular version bits.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 10_000;
const STARTER_CREATION_ROWS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type PriceExportRow = {
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

@Injectable({ providedIn: 'root' })
export class ProductTransferService {
  private readonly supabase = inject(SupabaseService);
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly locations = inject(LocationContextService);

  async exportCatalog(): Promise<void> {
    await this.catalogCache.ensureLoaded();
    if (!this.catalogCache.loaded()) {
      throw new Error('No cached product catalog is available on this device yet.');
    }
    if (this.catalogCache.catalogTruncated()) {
      throw new Error(`Product update workbooks support at most ${MAX_ROWS} variants.`);
    }

    let variants = this.cachedPriceVariants();
    if (variants.some(variant => !variant.variant_updated_at)) {
      await this.catalogCache.refresh();
      variants = this.cachedPriceVariants();
    }
    if (variants.some(variant => !variant.variant_updated_at)) {
      throw new Error('Refresh the catalog cache before exporting product updates.');
    }
    const location = this.locations.active();
    if (!location) throw new Error('Choose a business location before exporting.');

    const productVersions = new Map(
      this.catalogCache.families().map(product => [product.id, product.updated_at])
    );
    const productBarcodes = new Map(
      this.catalogCache.families().map(product => [product.id, product.barcode])
    );
    const rows: PriceExportRow[] = variants.map(variant => ({
      variant_id: variant.variant_id!,
      variant_updated_at: variant.variant_updated_at!,
      product_id: variant.product_id!,
      product_updated_at: productVersions.get(variant.product_id!) ?? '',
      product_barcode: productBarcodes.get(variant.product_id!) ?? null,
      product_name: variant.product_name ?? 'Product',
      manufacturer_name: variant.manufacturer_name ?? null,
      variant_name: variant.variant_name ?? '',
      sku: variant.sku ?? '',
      barcode: variant.barcode ?? null,
      kind: variant.kind ?? 'good',
      product_active: variant.product_active ?? true,
      variant_active: variant.variant_active ?? true,
      retail_price: Number(variant.price ?? 0),
      wholesale_price:
        variant.wholesale_price === null || variant.wholesale_price === undefined
          ? null
          : Number(variant.wholesale_price),
      stock: Number(variant.stock ?? 0),
      stock_value: Number(
        variant.variant_id
          ? (this.catalogCache.stock().get(variant.variant_id)?.stock_value ?? 0)
          : 0
      ),
      track_inventory: variant.track_inventory ?? false,
      allow_fractional: variant.allow_fractional ?? false,
      stock_location: `${location.code} — ${location.name}`,
    }));
    const exportedAt = this.catalogCache.fetchedAt() ?? new Date().toISOString();
    const workbook = await this.priceUpdateWorkbook(
      rows,
      exportedAt,
      location.id,
      this.catalogCache.manufacturers().map(item => item.name)
    );
    await this.download(
      workbook,
      `dukarun-products-and-stock-${location.code}-${exportedAt.slice(0, 10)}.xlsx`
    );
  }

  async downloadTemplate(): Promise<void> {
    const [locations, manufacturers] = await Promise.all([
      this.allLocations(),
      this.allManufacturers(),
    ]);
    const workbook = await this.baseWorkbook(
      locations.map(item => item.code),
      manufacturers.map(item => item.name)
    );
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
      '',
    ]);
    this.addMetadata(workbook, {
      formatVersion: '2',
      workbookKind: 'product_create',
      exportedAt: new Date().toISOString(),
    });
    this.finishProductsSheet(sheet);
    await this.download(workbook, 'dukarun-new-products-template.xlsx');
  }

  async preview(file: File): Promise<ProductWorkbookPreview> {
    if (file.size > MAX_FILE_BYTES) throw new Error('Workbook must be 10 MB or smaller.');
    const workbook = await createExcelWorkbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const metadata = this.readMetadata(workbook);
    if (
      metadata['workbook_kind'] === 'price_update' &&
      ['2', '3'].includes(metadata['format_version'] ?? '')
    ) {
      return this.previewPriceUpdate(workbook, file.name, metadata);
    }
    if (metadata['workbook_kind'] === 'product_create' && metadata['format_version'] === '2') {
      return this.previewProductCreate(workbook, file.name);
    }
    if (metadata['workbook_kind'] === 'inventory_report') {
      throw new Error(
        'Inventory reports are view-only. Download the editable products and stock workbook from Settings.'
      );
    }
    if (metadata['format_version']) {
      throw new Error('This workbook is outdated. Download a new workbook from Settings.');
    }
    throw new Error('Workbook type is not supported. Download a new workbook from Settings.');
  }

  private async previewProductCreate(
    workbook: Workbook,
    fileName: string
  ): Promise<CatalogImportPreview> {
    const sheet = workbook.getWorksheet('Products');
    if (!sheet) throw new Error('Workbook needs a Products sheet.');
    if (sheet.actualRowCount < 2) throw new Error('Products sheet has no data rows.');
    if (sheet.actualRowCount - 1 > MAX_ROWS)
      throw new Error(`Maximum ${MAX_ROWS} rows per import.`);

    const headerMap = this.headerMap(sheet);
    const hasTaxCategoryColumn = headerMap.has('tax_category_code');
    const { data: taxSettings, error: taxSettingsError } =
      await this.supabase.client.rpc('company_tax_settings');
    if (taxSettingsError) throw taxSettingsError;
    const validTaxCodes = new Set(
      ((taxSettings as { categories?: Array<{ code: string }> } | null)?.categories ?? []).map(
        category => category.code.toUpperCase()
      )
    );
    const errors: string[] = [];
    const groups = new Map<string, { product: CatalogImportProduct; signature: string }>();
    const seenSkus = new Set<string>();
    let parsedRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = Object.fromEntries(
        HEADERS.map(header => {
          const column = headerMap.get(header);
          return [header, column ? this.rawCell(row.getCell(column)) : null];
        })
      ) as RowValues;
      if (Object.values(values).every(value => value === null || value === '')) return;
      parsedRows++;
      try {
        const productId = this.optionalUuid(values.product_id, 'product_id');
        const variantId = this.optionalUuid(values.variant_id, 'variant_id');
        if (productId || variantId) {
          throw new Error('new-product templates cannot contain product or variant IDs');
        }
        const productKey = this.text(values.product_key);
        if (!productKey) throw new Error('product_key required');

        const name = this.requiredText(values.product_name, 'product_name');
        const manufacturer = this.text(values.manufacturer);
        const barcode = this.text(values.product_barcode);
        const active = this.bool(values.product_active, true, 'product_active');
        const taxCategoryCode = this.text(values.tax_category_code).toUpperCase();
        if (taxCategoryCode && !validTaxCodes.has(taxCategoryCode)) {
          throw new Error(`unknown tax_category_code ${taxCategoryCode}`);
        }
        const signature = JSON.stringify({
          name,
          manufacturer,
          barcode,
          active,
          taxCategoryCode,
        });
        let group = groups.get(productKey);
        if (!group) {
          group = {
            signature,
            product: {
              product_key: productKey,
              name,
              ...(manufacturer ? { manufacturer_name: manufacturer } : {}),
              barcode: barcode || null,
              active,
              ...(hasTaxCategoryColumn ? { tax_category_code: taxCategoryCode || null } : {}),
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
    const [currentProducts, currentVariants] = await Promise.all([
      this.allProducts(),
      this.allVariants(),
    ]);
    this.addBarcodeErrors(products, currentProducts, currentVariants, errors);

    return {
      kind: 'product_create',
      idempotencyKey: crypto.randomUUID(),
      fileName,
      products,
      rows: parsedRows,
      creates: products.length,
      errors,
    };
  }

  private async previewPriceUpdate(
    workbook: Workbook,
    fileName: string,
    metadata: Record<string, string>
  ): Promise<CatalogPriceUpdatePreview> {
    const companyId = this.supabase.claims()?.company_id ?? '';
    if (!companyId || metadata['company_id'] !== companyId) {
      throw new Error('This product update workbook belongs to a different company.');
    }
    const activeLocation = this.locations.active();
    if (!activeLocation || metadata['stock_location_id'] !== activeLocation.id) {
      throw new Error('Switch to the stock location used by this workbook before importing it.');
    }
    const sheet =
      workbook.getWorksheet('Products & Stock') ?? workbook.getWorksheet('Product Updates');
    if (!sheet) throw new Error('Workbook needs a Products & Stock sheet.');
    if (sheet.actualRowCount - 1 > MAX_ROWS + STARTER_CREATION_ROWS) {
      throw new Error(`Maximum ${MAX_ROWS} rows per import.`);
    }

    const headers = this.priceHeaderMap(sheet);
    const [currentProducts, currentVariants, manufacturers] = await Promise.all([
      this.allProducts(),
      this.allVariants(),
      this.allManufacturers(),
    ]);
    const currentProductsById = new Map(currentProducts.map(product => [product.id, product]));
    const currentById = new Map(currentVariants.map(variant => [variant.id, variant]));
    const manufacturerNamesById = new Map(manufacturers.map(item => [item.id, item.name]));
    const cachedById = new Map(
      this.cachedPriceVariants().map(variant => [variant.variant_id!, variant])
    );
    const seen = new Set<string>();
    const changes: CatalogPriceChange[] = [];
    const requestedManufacturerChanges: Array<CatalogManufacturerChange & { rowNumber: number }> =
      [];
    const productChanges: CatalogManufacturerChange[] = [];
    const errors: string[] = [];
    const conflicts: string[] = [];
    let rows = 0;
    let unchangedRows = 0;
    let retailChanges = 0;
    let wholesaleChanges = 0;
    let stockChanges = 0;
    const creationWorkbook = await createExcelWorkbook();
    const creationSheet = creationWorkbook.addWorksheet('Products');
    creationSheet.addRow([...HEADERS]);
    const creationSourceRows: number[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = (header: PriceUpdateHeader) => {
        const column = headers.get(header);
        if (!column) throw new Error(`Missing column: ${header}`);
        return row.getCell(column);
      };
      if (
        [...headers.values()].every(column => {
          const value = row.getCell(column).value;
          return value === null || value === undefined || value === '';
        })
      ) {
        return;
      }
      rows++;
      try {
        const variantId = this.optionalUuid(this.rawCell(cell('variant_id')), 'variant_id');
        if (!variantId) {
          const value = (header: PriceUpdateHeader): unknown => {
            const column = headers.get(header);
            return column ? this.rawCell(row.getCell(column)) : null;
          };
          const newManufacturer = this.text(value('new_manufacturer'));
          creationSheet.addRow([
            value('product_key'),
            value('product_id'),
            value('variant_id'),
            value('product_name'),
            newManufacturer.toUpperCase() === 'CLEAR' ? '' : newManufacturer,
            value('product_barcode'),
            value('product_active'),
            value('variant_name'),
            value('sku'),
            value('barcode'),
            value('kind'),
            value('new_retail_price_kes'),
            value('new_wholesale_price_kes'),
            value('track_inventory'),
            value('allow_fractional_stock'),
            value('variant_active'),
            value('new_stock_quantity'),
            value('stock_increase_unit_cost_kes'),
            activeLocation.code,
            value('batch_number'),
            value('expiry_date'),
            value('tax_category_code'),
          ]);
          creationSourceRows.push(rowNumber);
          return;
        }
        if (seen.has(variantId)) throw new Error('duplicate variant_id');
        seen.add(variantId);

        const current = currentById.get(variantId);
        if (!current) throw new Error('variant no longer exists');
        if (!this.text(this.rawCell(cell('product_name')))) {
          throw new Error(
            'product_name was cleared; delete the entire Excel table row to disable this variant'
          );
        }

        const retailCell = this.rawCell(cell('new_retail_price_kes'));
        const wholesaleCell = this.rawCell(cell('new_wholesale_price_kes'));
        const stockCell = this.rawCell(cell('new_stock_quantity'));
        const stockUnitCostCell = this.rawCell(cell('stock_increase_unit_cost_kes'));
        const manufacturerColumn = headers.get('new_manufacturer');
        const manufacturerCell = manufacturerColumn
          ? this.rawCell(row.getCell(manufacturerColumn))
          : null;
        const retailSupplied = !this.blank(retailCell);
        const wholesaleSupplied = !this.blank(wholesaleCell);
        const stockSupplied = !this.blank(stockCell);
        const stockUnitCostSupplied = !this.blank(stockUnitCostCell);
        const manufacturerSupplied = !this.blank(manufacturerCell);
        if (stockUnitCostSupplied && !stockSupplied) {
          throw new Error('stock unit cost requires a new stock quantity');
        }
        if (!retailSupplied && !wholesaleSupplied && !stockSupplied && !manufacturerSupplied) {
          unchangedRows++;
          return;
        }

        let manufacturerChanged = false;
        if (manufacturerSupplied) {
          const productIdColumn = headers.get('product_id');
          const productUpdatedAtColumn = headers.get('product_updated_at');
          if (!productIdColumn || !productUpdatedAtColumn) {
            throw new Error('manufacturer changes require a newly exported workbook');
          }
          const productId = this.optionalUuid(
            this.rawCell(row.getCell(productIdColumn)),
            'product_id'
          );
          if (!productId) throw new Error('product_id required');
          if (productId !== current.product_id)
            throw new Error('product_id does not match variant');
          const product = currentProductsById.get(productId);
          if (!product) throw new Error('product no longer exists');
          const productUpdatedAt = this.requiredText(
            this.rawCell(row.getCell(productUpdatedAtColumn)),
            'product_updated_at'
          );
          if (Number.isNaN(Date.parse(productUpdatedAt))) {
            throw new Error('product_updated_at is invalid');
          }
          const newManufacturer = this.manufacturerUpdateValue(manufacturerCell);
          const currentManufacturer = product.manufacturer_id
            ? (manufacturerNamesById.get(product.manufacturer_id) ?? null)
            : null;
          manufacturerChanged =
            this.normalizedManufacturer(newManufacturer) !==
            this.normalizedManufacturer(currentManufacturer);
          if (manufacturerChanged) {
            requestedManufacturerChanges.push({
              productId,
              expectedUpdatedAt: productUpdatedAt,
              productName: product.name,
              currentManufacturer,
              newManufacturer,
              rowNumber,
            });
          }
        }

        const cached = cachedById.get(variantId);
        const hasVariantInput = retailSupplied || wholesaleSupplied || stockSupplied;
        let expectedUpdatedAt = current.updated_at;
        if (hasVariantInput) {
          expectedUpdatedAt = this.requiredText(
            this.rawCell(cell('variant_updated_at')),
            'variant_updated_at'
          );
          if (Number.isNaN(Date.parse(expectedUpdatedAt))) {
            throw new Error('variant_updated_at is invalid');
          }
        }

        const newRetailPrice = retailSupplied
          ? this.wholeMoney(retailCell, 'new_retail_price_kes')
          : undefined;
        const newWholesalePrice = wholesaleSupplied
          ? this.wholesaleUpdateValue(wholesaleCell)
          : undefined;
        const retailChanged =
          newRetailPrice !== undefined && newRetailPrice !== Number(current.price);
        const wholesaleChanged =
          wholesaleSupplied && newWholesalePrice !== (current.wholesale_price ?? null);
        let expectedStockQuantity: number | undefined;
        let currentStockQuantity: number | undefined;
        let newStockQuantity: number | undefined;
        let stockUnitCost: number | undefined;
        let stockChanged = false;
        if (stockSupplied) {
          if (!current.track_inventory || current.kind === 'service') {
            throw new Error('this variant does not track stock');
          }
          if (!cached) throw new Error('variant is not available in the current location cache');
          expectedStockQuantity = this.quantity(
            this.rawCell(cell('expected_stock_quantity')),
            'expected_stock_quantity',
            current.allow_fractional
          );
          currentStockQuantity = Number(cached.stock ?? 0);
          newStockQuantity = this.quantity(
            stockCell,
            'new_stock_quantity',
            current.allow_fractional
          );
          stockChanged = newStockQuantity !== currentStockQuantity;
          if (stockUnitCostSupplied) {
            stockUnitCost = this.wholeMoney(stockUnitCostCell, 'stock_increase_unit_cost_kes');
            if (stockUnitCost === 0) throw new Error('stock unit cost must be greater than zero');
            if (!stockChanged || newStockQuantity <= currentStockQuantity) {
              throw new Error('stock unit cost is only used when increasing stock');
            }
          }
        }
        if (!retailChanged && !wholesaleChanged && !stockChanged && !manufacturerChanged) {
          unchangedRows++;
          return;
        }

        const effectiveRetail = newRetailPrice ?? Number(current.price);
        const effectiveWholesale = wholesaleSupplied
          ? (newWholesalePrice ?? null)
          : (current.wholesale_price ?? null);
        if (effectiveWholesale !== null && effectiveWholesale > effectiveRetail) {
          throw new Error('wholesale price cannot exceed retail price');
        }

        if ((retailChanged || wholesaleChanged) && current.updated_at !== expectedUpdatedAt) {
          conflicts.push(
            `Row ${rowNumber}: ${this.priceRowLabel(row, headers)} changed after export`
          );
          return;
        }
        if (stockChanged && currentStockQuantity !== expectedStockQuantity) {
          conflicts.push(
            `Row ${rowNumber}: ${this.priceRowLabel(row, headers)} stock changed after export`
          );
          return;
        }

        if (retailChanged || wholesaleChanged || stockChanged) {
          if (retailChanged) retailChanges++;
          if (wholesaleChanged) wholesaleChanges++;
          if (stockChanged) stockChanges++;
          changes.push({
            variantId,
            expectedUpdatedAt,
            productName: cell('product_name').text.trim() || 'Product',
            variantName: cell('variant_name').text.trim(),
            currentRetailPrice: Number(current.price),
            ...(retailChanged ? { newRetailPrice } : {}),
            currentWholesalePrice: current.wholesale_price ?? null,
            ...(wholesaleChanged ? { newWholesalePrice } : {}),
            ...(stockChanged
              ? {
                  expectedStockQuantity,
                  currentStockQuantity,
                  newStockQuantity,
                  ...(stockUnitCost !== undefined ? { stockUnitCost } : {}),
                  stockLocationId: activeLocation.id,
                  stockLocationName: activeLocation.name,
                }
              : {}),
          });
        }
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`);
      }
    });

    if (rows > MAX_ROWS) {
      errors.unshift(`Maximum ${MAX_ROWS} populated rows per import.`);
    }

    const requestsByProduct = new Map<
      string,
      Array<CatalogManufacturerChange & { rowNumber: number }>
    >();
    for (const change of requestedManufacturerChanges) {
      const requests = requestsByProduct.get(change.productId) ?? [];
      requests.push(change);
      requestsByProduct.set(change.productId, requests);
    }
    for (const requests of requestsByProduct.values()) {
      const first = requests[0]!;
      const requestedValues = new Set(
        requests.map(change => this.normalizedManufacturer(change.newManufacturer))
      );
      if (requestedValues.size > 1) {
        errors.push(
          `${first.productName}: conflicting new manufacturers on rows ${requests
            .map(change => change.rowNumber)
            .join(', ')}`
        );
        continue;
      }
      const product = currentProductsById.get(first.productId)!;
      if (requests.some(change => change.expectedUpdatedAt !== first.expectedUpdatedAt)) {
        errors.push(`${first.productName}: product version differs across variant rows`);
        continue;
      }
      if (product.updated_at !== first.expectedUpdatedAt) {
        conflicts.push(`${first.productName}: product details changed after export`);
        continue;
      }
      productChanges.push({
        productId: first.productId,
        expectedUpdatedAt: first.expectedUpdatedAt,
        productName: first.productName,
        currentManufacturer: first.currentManufacturer,
        newManufacturer: first.newManufacturer,
      });
    }

    let creationPreview: CatalogImportPreview | null = null;
    if (creationSourceRows.length) {
      creationPreview = await this.previewProductCreate(creationWorkbook, fileName);
      creationPreview = {
        ...creationPreview,
        errors: creationPreview.errors.map(message =>
          message.replace(/^Row (\d+):/, (_, rowNumber: string) => {
            const sourceRow = creationSourceRows[Number(rowNumber) - 2];
            return `Row ${sourceRow ?? rowNumber}:`;
          })
        ),
      };
      errors.push(...creationPreview.errors);
    }

    const disableChanges = this.previewDisabledRows(
      workbook,
      seen,
      currentProductsById,
      currentById,
      conflicts
    );

    return {
      kind: 'price_update',
      fileName,
      rows,
      unchangedRows,
      retailChanges,
      wholesaleChanges,
      stockChanges,
      manufacturerChanges: productChanges.length,
      changes,
      productChanges,
      creationPreview,
      disableChanges,
      disabledVariants: disableChanges.length,
      disabledProducts: disableChanges.filter(change => change.disableProduct).length,
      errors,
      conflicts,
    };
  }

  private addBarcodeErrors(
    products: CatalogImportProduct[],
    currentProducts: ProductRow[],
    currentVariants: VariantRow[],
    errors: string[]
  ): void {
    const currentProductById = new Map(currentProducts.map(product => [product.id, product]));
    const claimed = new Set<string>();
    for (const variant of currentVariants) {
      const product = currentProductById.get(variant.product_id);
      const barcode = variant.barcode?.trim() || product?.barcode?.trim();
      if (barcode && variant.active && product?.active) {
        claimed.add(barcode);
      }
    }

    for (const product of products) {
      if (!product.active) continue;
      for (const variant of product.variants) {
        if (!variant.active) continue;
        const barcode = variant.barcode?.trim() || product.barcode?.trim();
        if (!barcode) continue;
        if (claimed.has(barcode)) {
          errors.push(`${product.product_key}: duplicate barcode ${barcode}`);
        } else {
          claimed.add(barcode);
        }
      }
    }
  }

  private previewDisabledRows(
    workbook: Workbook,
    retainedVariantIds: ReadonlySet<string>,
    currentProductsById: ReadonlyMap<string, ProductRow>,
    currentVariantsById: ReadonlyMap<string, VariantRow>,
    conflicts: string[]
  ): CatalogDisableChange[] {
    const manifest = workbook.getWorksheet('_DukaRun Exported Rows');
    if (!manifest) return [];

    const candidates: CatalogDisableChange[] = [];
    const conflictKeys = new Set<string>();
    manifest.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const variantId = this.optionalUuid(row.getCell(1).value, 'manifest variant_id');
      const productId = this.optionalUuid(row.getCell(3).value, 'manifest product_id');
      if (!variantId || !productId || retainedVariantIds.has(variantId)) return;
      const variant = currentVariantsById.get(variantId);
      const product = currentProductsById.get(productId);
      if (!variant || !variant.active || !product || variant.product_id !== productId) return;

      const expectedUpdatedAt = this.requiredText(
        row.getCell(2).value,
        'manifest variant_updated_at'
      );
      const expectedProductUpdatedAt = this.requiredText(
        row.getCell(4).value,
        'manifest product_updated_at'
      );
      if (
        Number.isNaN(Date.parse(expectedUpdatedAt)) ||
        Number.isNaN(Date.parse(expectedProductUpdatedAt))
      ) {
        throw new Error('Workbook row manifest is invalid. Download a fresh workbook.');
      }
      if (
        variant.updated_at !== expectedUpdatedAt ||
        product.updated_at !== expectedProductUpdatedAt
      ) {
        const conflictKey = `${productId}:${variantId}`;
        if (!conflictKeys.has(conflictKey)) {
          const variantLabel =
            variant.name && variant.name !== 'Default' ? ` — ${variant.name}` : '';
          conflicts.push(
            `${product.name}${variantLabel}: changed after export and will not be disabled`
          );
          conflictKeys.add(conflictKey);
        }
        return;
      }
      candidates.push({
        variantId,
        expectedUpdatedAt,
        productId,
        expectedProductUpdatedAt,
        productName: product.name,
        variantName: variant.name === 'Default' ? '' : variant.name,
        sku: variant.sku,
        disableProduct: false,
      });
    });

    const actionableIds = new Set(candidates.map(change => change.variantId));
    const candidatesByProduct = new Map<string, CatalogDisableChange[]>();
    for (const change of candidates) {
      const productChanges = candidatesByProduct.get(change.productId) ?? [];
      productChanges.push(change);
      candidatesByProduct.set(change.productId, productChanges);
    }
    for (const [productId, productChanges] of candidatesByProduct) {
      const product = currentProductsById.get(productId);
      const activeVariantWillRemain = [...currentVariantsById.values()].some(
        variant =>
          variant.product_id === productId && variant.active && !actionableIds.has(variant.id)
      );
      if (product?.active && !activeVariantWillRemain) {
        productChanges[0]!.disableProduct = true;
      }
    }
    return candidates;
  }

  async apply(preview: ProductWorkbookPreview): Promise<ProductWorkbookResult> {
    if (preview.kind === 'price_update') return this.applyPriceUpdate(preview);
    return this.applyProductCreate(preview);
  }

  private async applyPriceUpdate(
    preview: CatalogPriceUpdatePreview
  ): Promise<CatalogPriceUpdateResult> {
    if (preview.errors.length || preview.conflicts.length) {
      throw new Error('Fix workbook errors before importing.');
    }
    if (
      preview.changes.length === 0 &&
      preview.productChanges.length === 0 &&
      preview.disableChanges.length === 0 &&
      !preview.creationPreview?.products.length
    ) {
      throw new Error('Workbook has no product changes.');
    }
    const variantChanges = preview.changes.map(change => ({
      variant_id: change.variantId,
      expected_updated_at: change.expectedUpdatedAt,
      ...(change.newRetailPrice !== undefined ? { new_retail_price: change.newRetailPrice } : {}),
      ...('newWholesalePrice' in change
        ? { new_wholesale_price: change.newWholesalePrice ?? null }
        : {}),
      ...(change.newStockQuantity !== undefined
        ? {
            stock_location_id: change.stockLocationId,
            expected_stock_quantity: change.expectedStockQuantity,
            new_stock_quantity: change.newStockQuantity,
            ...(change.stockUnitCost !== undefined
              ? { stock_unit_cost: change.stockUnitCost }
              : {}),
          }
        : {}),
    }));
    const productChanges = preview.productChanges.map(change => ({
      product_id: change.productId,
      expected_updated_at: change.expectedUpdatedAt,
      new_manufacturer_name: change.newManufacturer,
    }));
    const disableChanges = preview.disableChanges.map(change => ({
      variant_id: change.variantId,
      expected_updated_at: change.expectedUpdatedAt,
      product_id: change.productId,
      expected_product_updated_at: change.expectedProductUpdatedAt,
      disable_product: change.disableProduct,
    }));
    const importId = preview.creationPreview
      ? await this.stageProductCreate(preview.creationPreview)
      : null;
    const { data, error } = await this.supabase.client.rpc('apply_catalog_workbook_updates', {
      p_variant_changes: variantChanges as never,
      p_product_changes: productChanges as never,
      p_disable_changes: disableChanges as never,
      p_import_id: importId ?? undefined,
    });
    if (error) {
      if (error.message.startsWith('stock_changed:')) {
        throw new Error('Stock changed after preview. Export a fresh workbook and try again.');
      }
      if (error.message.includes('stale_catalog_price_export')) {
        throw new Error('A price changed after preview. Export a fresh workbook and try again.');
      }
      if (error.message.includes('stale_catalog_product_export')) {
        throw new Error(
          'Product details changed after preview. Export a fresh workbook and try again.'
        );
      }
      if (error.message.includes('stale_catalog_disable_export')) {
        throw new Error(
          'A product selected for disabling changed after preview. Export a fresh workbook and try again.'
        );
      }
      throw new Error(error.message);
    }
    return { kind: 'price_update', ...(data as Omit<CatalogPriceUpdateResult, 'kind'>) };
  }

  private async applyProductCreate(preview: CatalogImportPreview): Promise<CatalogImportResult> {
    if (preview.errors.length) throw new Error('Fix workbook errors before importing.');
    const importId = await this.stageProductCreate(preview);
    const finalized = await this.supabase.client.rpc('finalize_catalog_import', {
      p_import_id: importId,
    });
    if (finalized.error) throw finalized.error;
    const result = finalized.data as unknown as Omit<CatalogImportResult, 'kind'>;
    if (result.status === 'failed') throw new Error(result.error ?? 'Import failed');
    return { kind: 'product_create', ...result };
  }

  private async stageProductCreate(preview: CatalogImportPreview): Promise<string> {
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
    const begin = await this.supabase.client.rpc('begin_catalog_import', {
      p_mode: 'merge',
      p_idempotency_key: preview.idempotencyKey,
    });
    if (begin.error) throw begin.error;
    const started = begin.data as unknown as {
      import_id: string;
      status: CatalogImportResult['status'];
      mode: string;
      result: Omit<CatalogImportResult, 'kind'> | null;
    };
    if (started.mode !== 'merge') {
      throw new Error(
        `This preview already started as a ${started.mode} import. Create a new preview.`
      );
    }
    if (started.status === 'completed') return started.import_id;
    if (started.status === 'failed') {
      throw new Error(started.result?.error ?? 'This import attempt already failed');
    }
    const importId = started.import_id;
    const chunks = this.importChunks(products);
    for (let index = 0; index < chunks.length; index++) {
      const appended = await this.supabase.client.rpc('append_catalog_import_chunk', {
        p_import_id: importId,
        p_chunk_index: index,
        p_products: chunks[index] as never,
      });
      if (appended.error) throw appended.error;
    }
    return importId;
  }

  private importChunks(products: CatalogImportProduct[]): CatalogImportProduct[][] {
    const chunks: CatalogImportProduct[][] = [];
    let current: CatalogImportProduct[] = [];
    let variants = 0;
    for (const product of products) {
      if (product.variants.length > 2_000) {
        throw new Error('One product cannot contain more than 2,000 variants per import.');
      }
      if (current.length >= 500 || variants + product.variants.length > 2_000) {
        chunks.push(current);
        current = [];
        variants = 0;
      }
      current.push(product);
      variants += product.variants.length;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  private cachedPriceVariants(): Array<
    ReturnType<CatalogCacheService['catalog']>[number] & { variant_updated_at?: string }
  > {
    return this.catalogCache.catalog() as Array<
      ReturnType<CatalogCacheService['catalog']>[number] & { variant_updated_at?: string }
    >;
  }

  private async priceUpdateWorkbook(
    rows: PriceExportRow[],
    exportedAt: string,
    stockLocationId = this.locations.active()?.id ?? '',
    manufacturerNames: string[] = []
  ): Promise<Workbook> {
    const workbook = await createExcelWorkbook();
    workbook.creator = 'DukaRun';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Products & Stock', {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 8 }],
      properties: { tabColor: { argb: '1F4E78' } },
    });
    const blankCreationRows = Array.from({ length: STARTER_CREATION_ROWS }, () =>
      Array.from({ length: PRICE_UPDATE_HEADERS.length }, () => '')
    );
    sheet.addTable({
      name: 'DukaRunProductsAndStock',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: PRICE_UPDATE_HEADERS.map(name => ({ name })),
      rows: [
        ...rows.map(row => [
          row.variant_id,
          row.variant_updated_at,
          row.product_id,
          row.product_updated_at,
          '',
          row.product_name,
          row.manufacturer_name ?? '',
          '',
          row.product_barcode ?? '',
          row.variant_name === 'Default' ? '' : row.variant_name,
          row.sku,
          row.barcode ?? '',
          row.kind,
          row.product_active,
          row.variant_active,
          row.retail_price,
          '',
          row.wholesale_price ?? '',
          '',
          row.stock,
          row.stock_location,
          row.track_inventory,
          row.allow_fractional,
          row.stock,
          '',
          row.stock_value,
          '',
          '',
          '',
          '',
        ]),
        ...blankCreationRows,
      ],
    });
    const widths = [
      38, 30, 38, 30, 20, 28, 24, 24, 20, 22, 20, 20, 14, 15, 15, 24, 22, 27, 25, 24, 28, 18, 24,
      24, 22, 22, 30, 20, 16, 22,
    ];
    widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
    for (const column of [1, 2, 3, 4, 20]) sheet.getColumn(column).hidden = true;
    for (const column of [16, 17, 18, 19, 26, 27]) {
      sheet.getColumn(column).numFmt = '#,##0';
    }
    for (const column of [20, 24, 25]) sheet.getColumn(column).numFmt = '#,##0.###';
    sheet.getColumn(29).numFmt = 'yyyy-mm-dd';

    const reference = workbook.addWorksheet('Reference Data', {
      properties: { tabColor: { argb: 'FFC000' } },
    });
    reference.columns = [{ width: 36 }, { width: 20 }, { width: 20 }, { width: 24 }];
    reference.addRow([
      'Manufacturer choices',
      'Boolean values',
      'Product kinds',
      'Tax category codes',
    ]);
    const manufacturerChoices = [
      'CLEAR',
      ...new Set(
        [...manufacturerNames, ...rows.flatMap(row => row.manufacturer_name ?? [])]
          .map(name => name.trim())
          .filter(Boolean)
      ),
    ];
    const { data: taxSettings, error: taxSettingsError } =
      await this.supabase.client.rpc('company_tax_settings');
    if (taxSettingsError) throw taxSettingsError;
    const taxCodes =
      (taxSettings as { categories?: Array<{ code: string }> } | null)?.categories?.map(
        category => category.code
      ) ?? [];
    const sortedManufacturerChoices = manufacturerChoices
      .slice(1)
      .sort((a, b) => a.localeCompare(b));
    const referenceRows = Math.max(2, sortedManufacturerChoices.length + 1, taxCodes.length);
    for (let index = 0; index < referenceRows; index++) {
      reference.addRow([
        index === 0 ? 'CLEAR' : (sortedManufacturerChoices[index - 1] ?? ''),
        ['true', 'false'][index] ?? '',
        ['good', 'service'][index] ?? '',
        taxCodes[index] ?? '',
      ]);
    }
    this.styleReferenceHeader(reference);
    workbook.definedNames.add(
      `'Reference Data'!$A$2:$A$${sortedManufacturerChoices.length + 2}`,
      'DukaRunManufacturerChoices'
    );
    workbook.definedNames.add("'Reference Data'!$B$2:$B$3", 'DukaRunBooleanChoices');
    workbook.definedNames.add("'Reference Data'!$C$2:$C$3", 'DukaRunKindChoices');
    workbook.definedNames.add(
      `'Reference Data'!$D$2:$D$${Math.max(2, taxCodes.length + 1)}`,
      'DukaRunTaxCategoryChoices'
    );

    const firstCreationRow = rows.length + 2;
    for (let row = 2; row <= sheet.rowCount; row++) {
      const yellowColumns =
        row >= firstCreationRow
          ? [5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 22, 23, 25, 27, 28, 29, 30]
          : [8, 17, 19, 25, 27];
      for (const column of yellowColumns) {
        sheet.getCell(row, column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF2CC' },
        };
      }
      sheet.getCell(row, 8).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunManufacturerChoices'],
        showInputMessage: true,
        promptTitle: 'New manufacturer',
        prompt: 'Choose an existing manufacturer, type a new name, or choose CLEAR.',
        showErrorMessage: false,
      };
      sheet.getCell(row, 13).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunKindChoices'],
      };
      for (const column of [14, 15, 22, 23]) {
        sheet.getCell(row, column).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['DukaRunBooleanChoices'],
        };
      }
      sheet.getCell(row, 30).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunTaxCategoryChoices'],
        showErrorMessage: false,
      };
    }

    const manifest = workbook.addWorksheet('_DukaRun Exported Rows', { state: 'veryHidden' });
    manifest.addRow([
      'variant_id',
      'variant_updated_at',
      'product_id',
      'product_updated_at',
      'product_name',
      'variant_name',
      'sku',
    ]);
    rows.forEach(row =>
      manifest.addRow([
        row.variant_id,
        row.variant_updated_at,
        row.product_id,
        row.product_updated_at,
        row.product_name,
        row.variant_name === 'Default' ? '' : row.variant_name,
        row.sku,
      ])
    );

    const instructions = workbook.addWorksheet('Instructions', {
      properties: { tabColor: { argb: '70AD47' } },
    });
    instructions.columns = [{ width: 26 }, { width: 100 }];
    [
      ['Rule', 'Details'],
      [
        'Purpose',
        'Use this one workbook to update existing products, add new products, and disable products or variants you remove from the table.',
      ],
      [
        'Add products',
        'Use the blank yellow rows at the bottom. Leave hidden IDs blank, provide a product_key, and repeat that key and product fields for each variant.',
      ],
      [
        'Disable',
        'Delete the entire exported Excel table row—not only its visible cell contents—to disable that variant. If no active variants remain, the product is disabled too. Every disable is shown in the preview before applying.',
      ],
      [
        'Manufacturer',
        'Choose a new manufacturer on any one variant row for the product. Choose CLEAR to remove it. Conflicting choices for the same product are rejected.',
      ],
      [
        'Yellow cells',
        'For existing rows, only yellow new-value columns are imported. For new rows, complete the yellow identity and value columns.',
      ],
      ['New prices', 'Enter whole Kenyan shillings in the yellow new-price columns.'],
      ['New stock', 'Enter the counted quantity for the location shown in the stock columns.'],
      [
        'Stock cost',
        'For stock increases, enter a whole-KES unit cost only when the product has no previous cost at this location.',
      ],
      [
        'Stock permission',
        'Stock changes require the Manage stock adjustments permission and are recorded as counted-stock adjustments.',
      ],
      ['No change', 'Leave a yellow cell blank to keep the current value.'],
      ['Clear wholesale', 'Enter CLEAR in new_wholesale_price_kes to remove the wholesale price.'],
      [
        'Formulas',
        'You may calculate in helper columns, but paste the results as values into the yellow columns before importing.',
      ],
      [
        'Rows',
        'Each row is a sellable variant. Product name and manufacturer repeat so variants remain easy to identify. Never edit hidden identity columns.',
      ],
      [
        'Conflicts',
        'Re-export if DukaRun reports that a price or stock quantity changed after export.',
      ],
    ].forEach(row => instructions.addRow(row));
    instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructions.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' },
    };

    this.addMetadata(workbook, {
      formatVersion: '3',
      workbookKind: 'price_update',
      exportedAt,
      stockLocationId,
    });
    return workbook;
  }

  private async baseWorkbook(
    locationCodes: string[],
    manufacturerNames: string[] = []
  ): Promise<Workbook> {
    const workbook = await createExcelWorkbook();
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
      ['Purpose', 'This template creates new products. It does not update existing products.'],
      ['New products', 'Leave IDs blank and group variants with the same product_key.'],
      ['Prices', 'Enter whole Kenyan shillings only. Formula cells are not imported.'],
      [
        'Stock',
        'Opening stock is allowed only for new variants. Adjust existing stock separately.',
      ],
      ['Services', 'Services cannot track inventory or carry opening stock.'],
      [
        'VAT',
        'tax_category_code is optional. Leave it blank to use the shop default; exceptions must match Reference Data.',
      ],
    ].forEach(row => instructions.addRow(row));

    const refs = workbook.addWorksheet('Reference Data', {
      properties: { tabColor: { argb: 'FFC000' } },
    });
    const { data: taxSettings, error: taxSettingsError } =
      await this.supabase.client.rpc('company_tax_settings');
    if (taxSettingsError) throw taxSettingsError;
    const taxCodes =
      (taxSettings as { categories?: Array<{ code: string }> } | null)?.categories?.map(
        category => category.code
      ) ?? [];
    refs.addRow([
      'Boolean values',
      'Product kinds',
      'Stock location codes',
      'Tax category codes',
      'Manufacturer choices',
    ]);
    const sortedManufacturers = [
      ...new Set(manufacturerNames.map(name => name.trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    const count = Math.max(2, locationCodes.length, taxCodes.length, sortedManufacturers.length);
    for (let index = 0; index < count; index++) {
      refs.addRow([
        ['true', 'false'][index] ?? '',
        ['good', 'service'][index] ?? '',
        locationCodes[index] ?? '',
        taxCodes[index] ?? '',
        sortedManufacturers[index] ?? '',
      ]);
    }
    this.styleReferenceHeader(refs);
    workbook.definedNames.add(
      `'Reference Data'!$E$2:$E$${Math.max(2, sortedManufacturers.length + 1)}`,
      'DukaRunNewProductManufacturers'
    );
    return workbook;
  }

  private finishProductsSheet(sheet: Worksheet): void {
    sheet.autoFilter = { from: 'A1', to: `V${Math.max(2, sheet.rowCount)}` };
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
      sheet.getCell(row, 19).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ["'Reference Data'!$C$2:$C$1000"],
      };
      sheet.getCell(row, 22).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ["'Reference Data'!$D$2:$D$1000"],
      };
      sheet.getCell(row, 5).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunNewProductManufacturers'],
        showInputMessage: true,
        promptTitle: 'Manufacturer',
        prompt: 'Choose an existing manufacturer or type a new name.',
        showErrorMessage: false,
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

  private styleReferenceHeader(sheet: Worksheet): void {
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    sheet.autoFilter = {
      from: 'A1',
      to: `${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`,
    };
  }

  private addMetadata(
    workbook: Workbook,
    values: {
      formatVersion: string;
      workbookKind: 'price_update' | 'product_create';
      exportedAt: string;
      stockLocationId?: string;
    }
  ): void {
    const metadata = workbook.addWorksheet('_DukaRun Metadata', { state: 'veryHidden' });
    metadata.addRows([
      ['format_version', values.formatVersion],
      ['workbook_kind', values.workbookKind],
      ['entity', 'products'],
      ['company_id', this.supabase.claims()?.company_id ?? ''],
      ['exported_at', values.exportedAt],
      ...(values.stockLocationId ? [['stock_location_id', values.stockLocationId]] : []),
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
    const missing = HEADERS.filter(header => header !== 'tax_category_code' && !actual.has(header));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return new Map(
      HEADERS.flatMap(header => {
        const column = actual.get(header);
        return column ? ([[header, column]] as Array<[Header, number]>) : [];
      })
    );
  }

  private priceHeaderMap(sheet: Worksheet): Map<PriceUpdateHeader, number> {
    const actual = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => actual.set(cell.text.trim(), column));
    const missing = LEGACY_PRICE_UPDATE_HEADERS.filter(header => !actual.has(header));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return new Map(
      PRICE_UPDATE_HEADERS.flatMap(header => {
        const column = actual.get(header);
        return column ? ([[header, column]] as Array<[PriceUpdateHeader, number]>) : [];
      })
    );
  }

  private rawCell(cell: Cell): unknown {
    const value = cell.value;
    if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
      throw new Error(`Formulas are not allowed (${cell.address})`);
    }
    if (value && typeof value === 'object' && 'error' in value) {
      throw new Error(`Excel error ${value.error} (${cell.address})`);
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
    if (!Number.isSafeInteger(result) || result < 0) {
      throw new Error(`${name} must be a whole amount of zero or greater`);
    }
    return result;
  }

  private wholeMoney(value: unknown, name: string): number {
    const text = this.text(value).replaceAll(',', '');
    const result = Number(text);
    if (!text || !Number.isSafeInteger(result) || result < 0) {
      throw new Error(`${name} must be a whole amount of zero or greater`);
    }
    return result;
  }

  private wholesaleUpdateValue(value: unknown): number | null {
    if (this.text(value).toUpperCase() === 'CLEAR') return null;
    return this.wholeMoney(value, 'new_wholesale_price_kes');
  }

  private manufacturerUpdateValue(value: unknown): string | null {
    const name = this.text(value);
    if (name.toUpperCase() === 'CLEAR') return null;
    if (!name || name.length > 120) {
      throw new Error('new_manufacturer must be between 1 and 120 characters or CLEAR');
    }
    return name;
  }

  private normalizedManufacturer(value: string | null): string {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private quantity(value: unknown, name: string, allowFractional: boolean): number {
    const text = this.text(value).replaceAll(',', '');
    if (!/^\d+(?:\.\d{1,3})?$/.test(text)) {
      throw new Error(`${name} must be zero or greater with at most 3 decimal places`);
    }
    const result = Number(text);
    if (!Number.isFinite(result) || result > 99_999_999_999.999) {
      throw new Error(`${name} is too large`);
    }
    if (!allowFractional && !Number.isInteger(result)) {
      throw new Error(`${name} does not allow fractional stock`);
    }
    return result;
  }

  private blank(value: unknown): boolean {
    return value === null || value === undefined || this.text(value) === '';
  }

  private priceRowLabel(
    row: import('exceljs').Row,
    headers: Map<PriceUpdateHeader, number>
  ): string {
    const product = this.text(row.getCell(headers.get('product_name')!).value) || 'Product';
    const variant = this.text(row.getCell(headers.get('variant_name')!).value);
    return variant ? `${product} — ${variant}` : product;
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
        .select('id,name,barcode,active,manufacturer_id,tax_category_id,created_at,updated_at')
        .order('id')
        .range(offset, offset + 999)
    ) as Promise<ProductRow[]>;
  }

  private async allManufacturers(): Promise<ManufacturerRow[]> {
    return this.allPages(offset =>
      this.supabase.client
        .from('manufacturers')
        .select('id,name')
        .order('name')
        .range(offset, offset + 999)
    ) as Promise<ManufacturerRow[]>;
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
