import { Injectable, inject } from '@angular/core';
import type { Cell, Workbook, Worksheet } from 'exceljs';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { PermissionsService } from '../core/permissions.service';
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

export interface CatalogBatchChange {
  action: 'update' | 'create';
  batchId: string | null;
  variantId: string;
  stockLocationId: string;
  productName: string;
  variantName: string;
  sku: string;
  batchLabel: string;
  latest: boolean;
  expectedRemaining: number;
  currentUnitCost: number;
  expectedRemainingCost: number;
  currentBatchNumber: string | null;
  currentExpiryDate: string | null;
  newUnitCost: number;
  newBatchNumber: string | null;
  newExpiryDate: string | null;
  newRemainingCost: number;
  valueDifference: number;
  quantityAdded: number;
}

export interface CatalogPriceUpdatePreview {
  kind: 'catalog_workbook';
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
  batchChanges: CatalogBatchChange[];
  errors: string[];
  conflicts: string[];
}

export type ProductWorkbookPreview = CatalogPriceUpdatePreview;

export interface CatalogImportResult {
  kind: 'product_create';
  status: 'completed' | 'failed';
  import_id: string;
  mode: 'merge';
  created?: number;
  error?: string;
}

export interface CatalogPriceUpdateResult {
  kind: 'catalog_workbook';
  updated_variants: number;
  retail_changes: number;
  wholesale_changes: number;
  stock_changes: number;
  manufacturer_changes: number;
  created: number;
  disabled_variants: number;
  disabled_products: number;
  batch_changes: number;
  batches_created: number;
  batches_updated: number;
}

export type ProductWorkbookResult = CatalogPriceUpdateResult;

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

const PRICE_UPDATE_HEADERS = [
  'variant_id',
  'variant_updated_at',
  'product_id',
  'product_updated_at',
  'latest_batch_id',
  'expected_latest_batch_remaining_quantity',
  'expected_latest_batch_unit_cost_kes',
  'expected_latest_batch_remaining_value_kes',
  'expected_latest_batch_number',
  'expected_latest_expiry_date',
  'product_key',
  'product_name',
  'manufacturer',
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
  'latest_batch',
  'latest_batch_number',
  'latest_buying_price_kes',
  'latest_expiry_date',
  'tax_category_code',
] as const;

const BATCH_HEADERS = [
  'batch_id',
  'variant_id',
  'stock_location_id',
  'latest',
  'main_sheet_row',
  'expected_remaining_quantity',
  'expected_current_unit_cost_kes',
  'expected_remaining_value_kes',
  'expected_batch_number',
  'expected_expiry_date',
  'product_name',
  'manufacturer',
  'variant_name',
  'sku',
  'batch',
  'received_date',
  'remaining_quantity',
  'batch_number',
  'buying_price_kes',
  'expiry_date',
] as const;

type Header = (typeof HEADERS)[number];
type PriceUpdateHeader = (typeof PRICE_UPDATE_HEADERS)[number];
type BatchHeader = (typeof BATCH_HEADERS)[number];
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
type ManufacturerRow = { id: string; name: string; active: boolean };
type InventoryBatchRow = {
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
  latest_batch_id: string | null;
  latest_batch_label: string | null;
  latest_batch_unit_cost: number | null;
  latest_batch_number: string | null;
  latest_batch_expiry_date: string | null;
};

type BatchExportRow = InventoryBatchRow & {
  product_name: string;
  manufacturer_name: string | null;
  variant_name: string;
  sku: string;
  label: string;
  latest: boolean;
};

@Injectable({ providedIn: 'root' })
export class ProductTransferService {
  private readonly supabase = inject(SupabaseService);
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly locations = inject(LocationContextService);
  private readonly permissions = inject(PermissionsService);

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
    const exportedVariants = new Set(variants.map(variant => variant.variant_id!));
    const variantDetails = new Map(
      variants.map(variant => [
        variant.variant_id!,
        {
          productName: variant.product_name ?? 'Product',
          manufacturerName: variant.manufacturer_name ?? null,
          variantName: variant.variant_name ?? '',
          sku: variant.sku ?? '',
        },
      ])
    );
    const canCorrectBatchCosts =
      this.permissions.has('ManageStockAdjustments') && this.permissions.has('ViewFinancials');
    const openBatches = (canCorrectBatchCosts ? await this.allOpenBatches(location.id) : [])
      .filter(batch => exportedVariants.has(batch.variant_id))
      .sort((left, right) => this.compareBatchesNewestFirst(left, right));
    const latestBatchByVariant = new Map<string, InventoryBatchRow>();
    const batchRows: BatchExportRow[] = openBatches.map(batch => {
      const latest = !latestBatchByVariant.has(batch.variant_id);
      if (latest) latestBatchByVariant.set(batch.variant_id, batch);
      const details = variantDetails.get(batch.variant_id)!;
      return {
        ...batch,
        product_name: details.productName,
        manufacturer_name: details.manufacturerName,
        variant_name: details.variantName,
        sku: details.sku,
        label: this.batchLabel(batch),
        latest,
      };
    });
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
      latest_batch_id: latestBatchByVariant.get(variant.variant_id!)?.id ?? null,
      latest_batch_label: latestBatchByVariant.has(variant.variant_id!)
        ? this.batchLabel(latestBatchByVariant.get(variant.variant_id!)!)
        : null,
      latest_batch_unit_cost: latestBatchByVariant.get(variant.variant_id!)?.unit_cost ?? null,
      latest_batch_number: latestBatchByVariant.get(variant.variant_id!)?.batch_number ?? null,
      latest_batch_expiry_date: latestBatchByVariant.get(variant.variant_id!)?.expiry_date ?? null,
    }));
    const exportedAt = this.catalogCache.fetchedAt() ?? new Date().toISOString();
    const workbook = await this.priceUpdateWorkbook(
      rows,
      exportedAt,
      location.id,
      this.catalogCache.manufacturers().map(item => item.name),
      batchRows
    );
    await this.download(
      workbook,
      `dukarun-products-and-stock-${location.code}-${exportedAt.slice(0, 10)}.xlsx`
    );
  }

  async preview(file: File): Promise<ProductWorkbookPreview> {
    if (file.size > MAX_FILE_BYTES) throw new Error('Workbook must be 10 MB or smaller.');
    const workbook = await createExcelWorkbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const metadata = this.readMetadata(workbook);
    if (metadata['workbook_kind'] === 'catalog_workbook' && metadata['format_version'] === '5') {
      return this.previewPriceUpdate(workbook, file.name, metadata);
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
        if (openingQuantity > 0 && (!openingUnitCost || openingUnitCost <= 0)) {
          throw new Error('opening unit cost must be greater than zero');
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
    const sheet = workbook.getWorksheet('Products & Stock');
    if (!sheet) throw new Error('Workbook needs a Products & Stock sheet.');
    if (sheet.actualRowCount - 1 > MAX_ROWS + STARTER_CREATION_ROWS) {
      throw new Error(`Maximum ${MAX_ROWS} rows per import.`);
    }

    const headers = this.priceHeaderMap(sheet);
    const canEditBatches =
      this.permissions.has('ManageStockAdjustments') && this.permissions.has('ViewFinancials');
    const [currentProducts, currentVariants, manufacturers, currentOpenBatches] = await Promise.all(
      [
        this.allProducts(),
        this.allVariants(),
        this.allManufacturers(),
        canEditBatches ? this.allOpenBatches(activeLocation.id) : Promise.resolve([]),
      ]
    );
    const currentProductsById = new Map(currentProducts.map(product => [product.id, product]));
    const currentById = new Map(currentVariants.map(variant => [variant.id, variant]));
    const manufacturerNamesById = new Map(manufacturers.map(item => [item.id, item.name]));
    const allowedManufacturerNames = new Set(
      manufacturers.filter(item => item.active).map(item => this.normalizedManufacturer(item.name))
    );
    const cachedById = new Map(
      this.cachedPriceVariants().map(variant => [variant.variant_id!, variant])
    );
    const currentBatchesById = new Map(currentOpenBatches.map(batch => [batch.id, batch]));
    const latestBatchByVariant = new Map<string, InventoryBatchRow>();
    [...currentOpenBatches]
      .sort((left, right) => this.compareBatchesNewestFirst(left, right))
      .forEach(batch => {
        if (!latestBatchByVariant.has(batch.variant_id)) {
          latestBatchByVariant.set(batch.variant_id, batch);
        }
      });
    const seen = new Set<string>();
    const changes: CatalogPriceChange[] = [];
    const mainBatchChanges: CatalogBatchChange[] = [];
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
          const manufacturerValue = value('manufacturer');
          const newManufacturer = this.blank(manufacturerValue)
            ? null
            : this.manufacturerUpdateValue(manufacturerValue);
          this.assertListedManufacturer(newManufacturer, allowedManufacturerNames);
          const openingQuantityValue = value('new_stock_quantity');
          const openingQuantity = this.blank(openingQuantityValue)
            ? 0
            : this.optionalNumber(openingQuantityValue, 'new_stock_quantity');
          const hasPendingBatchDetails =
            !this.blank(value('latest_batch_number')) ||
            !this.blank(value('latest_buying_price_kes')) ||
            !this.blank(value('latest_expiry_date'));
          if (hasPendingBatchDetails && openingQuantity <= 0) {
            throw new Error('latest batch details require a positive new_stock_quantity');
          }
          creationSheet.addRow([
            value('product_key'),
            value('product_id'),
            value('variant_id'),
            value('product_name'),
            newManufacturer ?? '',
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
            openingQuantityValue,
            value('latest_buying_price_kes'),
            activeLocation.code,
            value('latest_batch_number'),
            value('latest_expiry_date'),
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
        const manufacturerCell = this.rawCell(cell('manufacturer'));
        const retailSupplied = !this.blank(retailCell);
        const wholesaleSupplied = !this.blank(wholesaleCell);
        const stockSupplied = !this.blank(stockCell);

        let manufacturerChanged = false;
        {
          if (this.blank(manufacturerCell)) {
            throw new Error('manufacturer must use the dropdown; choose CLEAR to remove it');
          }
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
            this.assertListedManufacturer(newManufacturer, allowedManufacturerNames);
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
        }

        const latestBatchId = this.optionalUuid(
          this.rawCell(cell('latest_batch_id')),
          'latest_batch_id'
        );
        const latestBatchNumber = this.batchNumber(
          this.rawCell(cell('latest_batch_number')),
          'latest_batch_number'
        );
        const latestBuyingPriceValue = this.rawCell(cell('latest_buying_price_kes'));
        const latestExpiryDate = this.date(this.rawCell(cell('latest_expiry_date')));
        const quantityAdded =
          stockChanged && newStockQuantity! > currentStockQuantity!
            ? newStockQuantity! - currentStockQuantity!
            : 0;
        const hasVisibleBatchValue =
          latestBatchNumber !== null ||
          !this.blank(latestBuyingPriceValue) ||
          latestExpiryDate !== null;
        let mainBatchChanged = false;

        if (latestBatchId) {
          const expectedRemaining = this.quantity(
            this.rawCell(cell('expected_latest_batch_remaining_quantity')),
            'expected_latest_batch_remaining_quantity',
            true
          );
          const expectedUnitCost = this.wholeMoney(
            this.rawCell(cell('expected_latest_batch_unit_cost_kes')),
            'expected_latest_batch_unit_cost_kes'
          );
          const expectedRemainingCost = this.wholeMoney(
            this.rawCell(cell('expected_latest_batch_remaining_value_kes')),
            'expected_latest_batch_remaining_value_kes'
          );
          const expectedBatchNumber = this.batchNumber(
            this.rawCell(cell('expected_latest_batch_number')),
            'expected_latest_batch_number'
          );
          const expectedExpiryDate = this.date(this.rawCell(cell('expected_latest_expiry_date')));
          if (this.blank(latestBuyingPriceValue)) {
            throw new Error('latest_buying_price_kes cannot be blank for an existing batch');
          }
          const newUnitCost = this.wholeMoney(latestBuyingPriceValue, 'latest_buying_price_kes');
          const edited =
            newUnitCost !== expectedUnitCost ||
            latestBatchNumber !== expectedBatchNumber ||
            latestExpiryDate !== expectedExpiryDate;
          if (edited || quantityAdded > 0) {
            if (!canEditBatches) {
              throw new Error('latest batch changes require stock-adjustment and financial access');
            }
            if (quantityAdded > 0 && newUnitCost <= 0) {
              throw new Error(
                'latest_buying_price_kes must be greater than zero when adding stock'
              );
            }
            const currentBatch = currentBatchesById.get(latestBatchId);
            if (!currentBatch || currentBatch.remaining <= 0) {
              conflicts.push(
                `Row ${rowNumber}: ${this.priceRowLabel(row, headers)} latest batch is exhausted or no longer exists`
              );
            } else if (
              currentBatch.variant_id !== variantId ||
              currentBatch.stock_location_id !== activeLocation.id ||
              latestBatchByVariant.get(variantId)?.id !== latestBatchId
            ) {
              throw new Error('latest batch identity does not match this variant and location');
            } else if (
              currentBatch.remaining !== expectedRemaining ||
              currentBatch.unit_cost !== expectedUnitCost ||
              currentBatch.remaining_cost !== expectedRemainingCost ||
              (currentBatch.batch_number?.trim() || null) !== expectedBatchNumber ||
              currentBatch.expiry_date !== expectedExpiryDate
            ) {
              conflicts.push(
                `Row ${rowNumber}: ${this.priceRowLabel(row, headers)} latest batch changed after export`
              );
            } else {
              const correctedRemainingValue =
                newUnitCost === expectedUnitCost
                  ? expectedRemainingCost
                  : Math.round(currentBatch.remaining * newUnitCost);
              const newRemainingCost = Math.round(
                (currentBatch.remaining + quantityAdded) * newUnitCost
              );
              if (
                !Number.isSafeInteger(correctedRemainingValue) ||
                !Number.isSafeInteger(newRemainingCost)
              ) {
                throw new Error('resulting batch value is too large');
              }
              mainBatchChanges.push({
                action: 'update',
                batchId: latestBatchId,
                variantId,
                stockLocationId: activeLocation.id,
                productName: cell('product_name').text.trim() || 'Product',
                variantName: cell('variant_name').text.trim(),
                sku: cell('sku').text.trim(),
                batchLabel: this.batchLabel(currentBatch),
                latest: true,
                expectedRemaining,
                currentUnitCost: expectedUnitCost,
                expectedRemainingCost,
                currentBatchNumber: expectedBatchNumber,
                currentExpiryDate: expectedExpiryDate,
                newUnitCost,
                newBatchNumber: latestBatchNumber,
                newExpiryDate: latestExpiryDate,
                newRemainingCost,
                valueDifference: correctedRemainingValue - expectedRemainingCost,
                quantityAdded,
              });
              mainBatchChanged = true;
            }
          }
        } else if (hasVisibleBatchValue || quantityAdded > 0) {
          if (!canEditBatches) {
            throw new Error(
              'creating a latest batch requires stock-adjustment and financial access'
            );
          }
          if (quantityAdded <= 0) {
            throw new Error('latest batch details require a stock increase');
          }
          if (this.blank(latestBuyingPriceValue)) {
            throw new Error('latest_buying_price_kes is required when adding stock');
          }
          const newUnitCost = this.wholeMoney(latestBuyingPriceValue, 'latest_buying_price_kes');
          if (newUnitCost <= 0) {
            throw new Error('latest_buying_price_kes must be greater than zero when adding stock');
          }
          const newRemainingCost = Math.round(quantityAdded * newUnitCost);
          if (!Number.isSafeInteger(newRemainingCost)) {
            throw new Error('resulting batch value is too large');
          }
          mainBatchChanges.push({
            action: 'create',
            batchId: null,
            variantId,
            stockLocationId: activeLocation.id,
            productName: cell('product_name').text.trim() || 'Product',
            variantName: cell('variant_name').text.trim(),
            sku: cell('sku').text.trim(),
            batchLabel: latestBatchNumber || 'New latest batch',
            latest: true,
            expectedRemaining: 0,
            currentUnitCost: 0,
            expectedRemainingCost: 0,
            currentBatchNumber: null,
            currentExpiryDate: null,
            newUnitCost,
            newBatchNumber: latestBatchNumber,
            newExpiryDate: latestExpiryDate,
            newRemainingCost,
            valueDifference: 0,
            quantityAdded,
          });
          mainBatchChanged = true;
        }

        if (
          !retailChanged &&
          !wholesaleChanged &&
          !stockChanged &&
          !manufacturerChanged &&
          !mainBatchChanged
        ) {
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
    const otherBatchChanges = await this.previewBatchChanges(
      workbook,
      activeLocation.id,
      currentProductsById,
      currentById,
      currentBatchesById,
      errors,
      conflicts
    );
    const batchChanges = [...mainBatchChanges, ...otherBatchChanges];

    return {
      kind: 'catalog_workbook',
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
      batchChanges,
      errors,
      conflicts,
    };
  }

  private async previewBatchChanges(
    workbook: Workbook,
    stockLocationId: string,
    currentProductsById: ReadonlyMap<string, ProductRow>,
    currentVariantsById: ReadonlyMap<string, VariantRow>,
    currentBatches: ReadonlyMap<string, InventoryBatchRow>,
    errors: string[],
    conflicts: string[]
  ): Promise<CatalogBatchChange[]> {
    const sheet = workbook.getWorksheet('Batches');
    if (!sheet) throw new Error('Workbook needs a Batches sheet. Download a fresh workbook.');
    const headers = this.batchHeaderMap(sheet);
    if (
      !this.permissions.has('ManageStockAdjustments') ||
      !this.permissions.has('ViewFinancials')
    ) {
      return [];
    }

    const seen = new Set<string>();
    const changes: CatalogBatchChange[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = (header: BatchHeader) => row.getCell(headers.get(header)!);
      try {
        if (this.bool(this.rawCell(cell('latest')), false, 'latest')) return;
        const batchId = this.optionalUuid(this.rawCell(cell('batch_id')), 'batch_id');
        const variantId = this.optionalUuid(this.rawCell(cell('variant_id')), 'variant_id');
        if (!batchId || !variantId) throw new Error('hidden batch identity is missing');
        if (seen.has(batchId)) throw new Error('duplicate batch_id');
        seen.add(batchId);

        const expectedRemaining = this.quantity(
          this.rawCell(cell('expected_remaining_quantity')),
          'expected_remaining_quantity',
          true
        );
        const expectedUnitCost = this.wholeMoney(
          this.rawCell(cell('expected_current_unit_cost_kes')),
          'expected_current_unit_cost_kes'
        );
        const expectedRemainingCost = this.wholeMoney(
          this.rawCell(cell('expected_remaining_value_kes')),
          'expected_remaining_value_kes'
        );
        const expectedBatchNumber = this.batchNumber(
          this.rawCell(cell('expected_batch_number')),
          'expected_batch_number'
        );
        const expectedExpiryDate = this.date(this.rawCell(cell('expected_expiry_date')));
        const newBatchNumber = this.batchNumber(this.rawCell(cell('batch_number')), 'batch_number');
        const newUnitCost = this.wholeMoney(
          this.rawCell(cell('buying_price_kes')),
          'buying_price_kes'
        );
        const newExpiryDate = this.date(this.rawCell(cell('expiry_date')));
        const edited =
          newUnitCost !== expectedUnitCost ||
          newBatchNumber !== expectedBatchNumber ||
          newExpiryDate !== expectedExpiryDate;
        if (!edited) return;
        if (newUnitCost === 0 && newUnitCost !== expectedUnitCost) {
          throw new Error('buying_price_kes must be greater than zero when changed');
        }

        const current = currentBatches.get(batchId);
        if (!current || current.remaining <= 0) {
          conflicts.push(
            `Batches row ${rowNumber}: ${this.batchRowLabel(row, headers)} is exhausted or no longer exists`
          );
          return;
        }
        if (current.variant_id !== variantId || current.stock_location_id !== stockLocationId) {
          throw new Error('batch identity does not match this location and variant');
        }
        if (
          current.remaining !== expectedRemaining ||
          current.unit_cost !== expectedUnitCost ||
          current.remaining_cost !== expectedRemainingCost ||
          (current.batch_number?.trim() || null) !== expectedBatchNumber ||
          current.expiry_date !== expectedExpiryDate
        ) {
          conflicts.push(
            `Batches row ${rowNumber}: ${this.batchRowLabel(row, headers)} changed after export`
          );
          return;
        }

        const variant = currentVariantsById.get(variantId);
        const product = variant ? currentProductsById.get(variant.product_id) : undefined;
        if (!variant || !product) throw new Error('batch product no longer exists');
        const newRemainingCost =
          newUnitCost === expectedUnitCost
            ? expectedRemainingCost
            : Math.round(current.remaining * newUnitCost);
        if (!Number.isSafeInteger(newRemainingCost)) {
          throw new Error('resulting batch value is too large');
        }
        changes.push({
          action: 'update',
          batchId,
          variantId,
          stockLocationId,
          productName: product.name,
          variantName: variant.name === 'Default' ? '' : variant.name,
          sku: variant.sku,
          batchLabel: this.batchLabel(current),
          latest: false,
          expectedRemaining,
          currentUnitCost: current.unit_cost,
          expectedRemainingCost,
          currentBatchNumber: expectedBatchNumber,
          currentExpiryDate: expectedExpiryDate,
          newUnitCost,
          newBatchNumber,
          newExpiryDate,
          newRemainingCost,
          valueDifference: newRemainingCost - current.remaining_cost,
          quantityAdded: 0,
        });
      } catch (error) {
        errors.push(
          `Batches row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`
        );
      }
    });
    return changes;
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
    return this.applyPriceUpdate(preview);
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
      preview.batchChanges.length === 0 &&
      !preview.creationPreview?.products.length
    ) {
      throw new Error('Workbook has no changes.');
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
    const batchChanges = preview.batchChanges.map(change => ({
      action: change.action,
      ...(change.batchId ? { batch_id: change.batchId } : {}),
      variant_id: change.variantId,
      stock_location_id: change.stockLocationId,
      latest: change.latest,
      expected_remaining: change.expectedRemaining,
      expected_unit_cost: change.currentUnitCost,
      expected_remaining_cost: change.expectedRemainingCost,
      expected_batch_number: change.currentBatchNumber,
      expected_expiry_date: change.currentExpiryDate,
      new_unit_cost: change.newUnitCost,
      new_batch_number: change.newBatchNumber,
      new_expiry_date: change.newExpiryDate,
      quantity_added: change.quantityAdded,
    }));
    const importId = preview.creationPreview
      ? await this.stageProductCreate(preview.creationPreview)
      : null;
    const { data, error } = await this.supabase.client.rpc('apply_catalog_workbook_updates', {
      p_variant_changes: variantChanges as never,
      p_product_changes: productChanges as never,
      p_disable_changes: disableChanges as never,
      p_batch_changes: batchChanges as never,
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
      if (error.message.includes('stale_catalog_batch_export')) {
        throw new Error('A batch changed after preview. Export a fresh workbook and try again.');
      }
      throw new Error(error.message);
    }
    return { kind: 'catalog_workbook', ...(data as Omit<CatalogPriceUpdateResult, 'kind'>) };
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
    manufacturerNames: string[] = [],
    batchRows: BatchExportRow[] = []
  ): Promise<Workbook> {
    const workbook = await createExcelWorkbook();
    workbook.creator = 'DukaRun';
    workbook.created = new Date();
    const canEditBatches =
      this.permissions.has('ManageStockAdjustments') && this.permissions.has('ViewFinancials');
    const sheet = workbook.addWorksheet('Products & Stock', {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 13 }],
      properties: { tabColor: { argb: '1F4E78' } },
    });
    const column = (header: PriceUpdateHeader) => PRICE_UPDATE_HEADERS.indexOf(header) + 1;
    const batchById = new Map(batchRows.map(batch => [batch.id, batch]));
    const exportedRows = rows.map(row => {
      const latestBatch = row.latest_batch_id ? batchById.get(row.latest_batch_id) : undefined;
      const values: Record<PriceUpdateHeader, unknown> = {
        variant_id: row.variant_id,
        variant_updated_at: row.variant_updated_at,
        product_id: row.product_id,
        product_updated_at: row.product_updated_at,
        latest_batch_id: row.latest_batch_id ?? '',
        expected_latest_batch_remaining_quantity: latestBatch?.remaining ?? '',
        expected_latest_batch_unit_cost_kes: row.latest_batch_unit_cost ?? '',
        expected_latest_batch_remaining_value_kes: latestBatch?.remaining_cost ?? '',
        expected_latest_batch_number: row.latest_batch_number ?? '',
        expected_latest_expiry_date: row.latest_batch_expiry_date ?? '',
        product_key: '',
        product_name: row.product_name,
        manufacturer: row.manufacturer_name ?? 'CLEAR',
        product_barcode: row.product_barcode ?? '',
        variant_name: row.variant_name === 'Default' ? '' : row.variant_name,
        sku: row.sku,
        barcode: row.barcode ?? '',
        kind: row.kind,
        product_active: row.product_active,
        variant_active: row.variant_active,
        current_retail_price_kes: row.retail_price,
        new_retail_price_kes: '',
        current_wholesale_price_kes: row.wholesale_price ?? '',
        new_wholesale_price_kes: '',
        expected_stock_quantity: row.stock,
        stock_location: row.stock_location,
        track_inventory: row.track_inventory,
        allow_fractional_stock: row.allow_fractional,
        current_stock_quantity: row.stock,
        new_stock_quantity: '',
        stock_value_kes: row.stock_value,
        latest_batch: row.latest_batch_label ?? '',
        latest_batch_number: row.latest_batch_number ?? '',
        latest_buying_price_kes: row.latest_batch_unit_cost ?? '',
        latest_expiry_date: row.latest_batch_expiry_date ?? '',
        tax_category_code: '',
      };
      return PRICE_UPDATE_HEADERS.map(header => values[header]);
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
      rows: [...exportedRows, ...blankCreationRows],
    });
    PRICE_UPDATE_HEADERS.forEach((header, index) => {
      const widths: Partial<Record<PriceUpdateHeader, number>> = {
        product_key: 20,
        product_name: 28,
        manufacturer: 24,
        product_barcode: 20,
        variant_name: 22,
        sku: 20,
        barcode: 20,
        kind: 14,
        current_retail_price_kes: 24,
        new_retail_price_kes: 22,
        current_wholesale_price_kes: 27,
        new_wholesale_price_kes: 25,
        stock_location: 28,
        current_stock_quantity: 24,
        new_stock_quantity: 22,
        stock_value_kes: 22,
        latest_batch: 36,
        latest_batch_number: 24,
        latest_buying_price_kes: 25,
        latest_expiry_date: 22,
        tax_category_code: 24,
      };
      sheet.getColumn(index + 1).width = widths[header] ?? 18;
    });
    for (const header of [
      'variant_id',
      'variant_updated_at',
      'product_id',
      'product_updated_at',
      'latest_batch_id',
      'expected_latest_batch_remaining_quantity',
      'expected_latest_batch_unit_cost_kes',
      'expected_latest_batch_remaining_value_kes',
      'expected_latest_batch_number',
      'expected_latest_expiry_date',
      'expected_stock_quantity',
    ] satisfies PriceUpdateHeader[]) {
      sheet.getColumn(column(header)).hidden = true;
    }
    for (const header of [
      'current_retail_price_kes',
      'new_retail_price_kes',
      'current_wholesale_price_kes',
      'new_wholesale_price_kes',
      'stock_value_kes',
      'latest_buying_price_kes',
    ] satisfies PriceUpdateHeader[]) {
      sheet.getColumn(column(header)).numFmt = '#,##0';
    }
    for (const header of [
      'expected_stock_quantity',
      'current_stock_quantity',
      'new_stock_quantity',
    ] satisfies PriceUpdateHeader[]) {
      sheet.getColumn(column(header)).numFmt = '#,##0.###';
    }
    sheet.getColumn(column('latest_expiry_date')).numFmt = 'yyyy-mm-dd';

    const mainRowsByVariant = new Map(rows.map((row, index) => [row.variant_id, index + 2]));
    const batchSheetRows = this.addBatchesSheet(workbook, batchRows, mainRowsByVariant);
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (!row.latest_batch_id) {
        if (row.track_inventory && row.kind !== 'service') {
          sheet.getCell(rowNumber, column('latest_batch')).value =
            'No open batch — created when stock increases';
        }
        return;
      }
      const targetRow = batchSheetRows.get(row.latest_batch_id);
      if (!targetRow) return;
      sheet.getCell(rowNumber, column('latest_batch')).value = {
        text: row.latest_batch_label ?? 'Open batch',
        hyperlink: `#'Batches'!K${targetRow}`,
        tooltip: 'Open this canonical batch row',
      };
      sheet.getCell(rowNumber, column('latest_batch')).font = {
        color: { argb: 'FF0563C1' },
        underline: true,
      };
      if (row.latest_batch_unit_cost === 0) {
        sheet.getCell(rowNumber, column('latest_buying_price_kes')).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF4CCCC' },
        };
        sheet.getCell(rowNumber, column('latest_buying_price_kes')).font = {
          bold: true,
          color: { argb: 'FF9C0006' },
        };
      }
    });

    const sortedManufacturerChoices = [
      ...new Set(manufacturerNames.map(name => name.trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    const manufacturers = workbook.addWorksheet('Manufacturers', {
      properties: { tabColor: { argb: 'A5A5A5' } },
    });
    manufacturers.getColumn(1).width = 38;
    manufacturers.addTable({
      name: 'DukaRunManufacturers',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: [{ name: 'manufacturer_name' }],
      rows: ['CLEAR', ...sortedManufacturerChoices].map(name => [name]),
    });
    manufacturers.getCell('A1').note =
      'Reference list for the manufacturer dropdown. Manage this list in DukaRun, not in Excel.';
    workbook.definedNames.add(
      `'Manufacturers'!$A$2:$A$${sortedManufacturerChoices.length + 2}`,
      'DukaRunManufacturerChoices'
    );

    const reference = workbook.addWorksheet('Reference Data', {
      properties: { tabColor: { argb: 'FFC000' } },
    });
    reference.columns = [{ width: 20 }, { width: 20 }, { width: 24 }];
    reference.addRow(['Boolean values', 'Product kinds', 'Tax category codes']);
    const { data: taxSettings, error: taxSettingsError } =
      await this.supabase.client.rpc('company_tax_settings');
    if (taxSettingsError) throw taxSettingsError;
    const taxCodes =
      (taxSettings as { categories?: Array<{ code: string }> } | null)?.categories?.map(
        category => category.code
      ) ?? [];
    const referenceRows = Math.max(2, taxCodes.length);
    for (let index = 0; index < referenceRows; index++) {
      reference.addRow([
        ['true', 'false'][index] ?? '',
        ['good', 'service'][index] ?? '',
        taxCodes[index] ?? '',
      ]);
    }
    this.styleReferenceHeader(reference);
    workbook.definedNames.add("'Reference Data'!$A$2:$A$3", 'DukaRunBooleanChoices');
    workbook.definedNames.add("'Reference Data'!$B$2:$B$3", 'DukaRunKindChoices');
    workbook.definedNames.add(
      `'Reference Data'!$C$2:$C$${Math.max(2, taxCodes.length + 1)}`,
      'DukaRunTaxCategoryChoices'
    );

    const firstCreationRow = rows.length + 2;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const existingEditable: PriceUpdateHeader[] = [
        'manufacturer',
        'new_retail_price_kes',
        'new_wholesale_price_kes',
        'new_stock_quantity',
        ...(canEditBatches
          ? ([
              'latest_batch_number',
              'latest_buying_price_kes',
              'latest_expiry_date',
            ] satisfies PriceUpdateHeader[])
          : []),
      ];
      const creationEditable: PriceUpdateHeader[] = [
        'product_key',
        'product_name',
        'manufacturer',
        'product_barcode',
        'variant_name',
        'sku',
        'barcode',
        'kind',
        'product_active',
        'variant_active',
        'new_retail_price_kes',
        'new_wholesale_price_kes',
        'track_inventory',
        'allow_fractional_stock',
        'new_stock_quantity',
        ...(canEditBatches
          ? ([
              'latest_batch_number',
              'latest_buying_price_kes',
              'latest_expiry_date',
            ] satisfies PriceUpdateHeader[])
          : []),
        'tax_category_code',
      ];
      for (const header of rowNumber >= firstCreationRow ? creationEditable : existingEditable) {
        sheet.getCell(rowNumber, column(header)).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF2CC' },
        };
      }
      sheet.getCell(rowNumber, column('manufacturer')).dataValidation = {
        type: 'list',
        allowBlank: rowNumber >= firstCreationRow,
        formulae: ['DukaRunManufacturerChoices'],
        showInputMessage: true,
        promptTitle: 'Manufacturer',
        prompt: 'Choose an existing manufacturer, or CLEAR to remove it.',
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Choose a listed manufacturer',
        error: 'Select a value from the manufacturer dropdown.',
      };
      sheet.getCell(rowNumber, column('kind')).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunKindChoices'],
      };
      for (const header of [
        'product_active',
        'variant_active',
        'track_inventory',
        'allow_fractional_stock',
      ] satisfies PriceUpdateHeader[]) {
        sheet.getCell(rowNumber, column(header)).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['DukaRunBooleanChoices'],
        };
      }
      sheet.getCell(rowNumber, column('tax_category_code')).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['DukaRunTaxCategoryChoices'],
        showErrorMessage: false,
      };
      if (canEditBatches) {
        sheet.getCell(rowNumber, column('latest_buying_price_kes')).dataValidation = {
          type: 'whole',
          operator: rowNumber >= firstCreationRow ? 'greaterThan' : 'greaterThanOrEqual',
          allowBlank: rowNumber >= firstCreationRow,
          formulae: [0],
          showInputMessage: true,
          promptTitle: 'Latest buying price',
          prompt: 'Enter the whole-KES buying price for the linked latest batch.',
          showErrorMessage: true,
          errorTitle: 'Invalid buying price',
          error:
            rowNumber >= firstCreationRow
              ? 'Enter a positive whole amount when adding opening stock.'
              : 'Enter a whole amount of zero or greater.',
        };
      }
    }
    rows.forEach((row, index) => {
      if (row.latest_batch_unit_cost !== 0) return;
      const priceCell = sheet.getCell(index + 2, column('latest_buying_price_kes'));
      priceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4CCCC' },
      };
      priceCell.font = { bold: true, color: { argb: 'FF9C0006' } };
    });

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
        'Choose a value from the strict dropdown linked to the Manufacturers sheet. Choose CLEAR to remove it. New manufacturer names cannot be created from this workbook.',
      ],
      [
        'Yellow cells',
        'Yellow cells are the only intended input cells. Manufacturer and latest-batch fields are prefilled because they edit the linked records directly.',
      ],
      ['New prices', 'Enter whole Kenyan shillings in the yellow new-price columns.'],
      ['New stock', 'Enter the counted quantity for the location shown in the stock columns.'],
      [
        'Latest batch',
        'Latest batch number, buying price, and expiry edit the linked open batch. If none exists, increasing stock creates one from these fields.',
      ],
      [
        'Batches sheet',
        'Batches is the canonical list of open batches. Latest rows mirror Products & Stock; edit those on the main sheet. Older open rows can be edited here.',
      ],
      [
        'Batch row deletion',
        'Deleting a row from Batches does nothing. It never disables a product or batch. Exhausted batches are intentionally excluded.',
      ],
      [
        'Batch valuation',
        'A batch cost correction updates the value of its remaining stock. It does not rewrite past sales or cost of goods sold. Every correction and valuation difference is shown in the preview.',
      ],
      [
        'Stock permission',
        'Stock changes require stock-adjustment access. Increases also require financial access and a positive latest buying price.',
      ],
      [
        'Stock increases',
        'A counted-stock increase extends the linked latest batch. If no open batch exists, DukaRun creates one. Record separate purchase lots through Purchasing.',
      ],
      [
        'No change',
        'Leave new price and stock cells blank. Prefilled manufacturer and batch cells stay unchanged unless edited.',
      ],
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
        'Re-export if DukaRun reports that a product, stock quantity, or batch changed after export.',
      ],
    ].forEach(row => instructions.addRow(row));
    instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructions.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' },
    };

    this.addMetadata(workbook, {
      formatVersion: '5',
      workbookKind: 'catalog_workbook',
      exportedAt,
      stockLocationId,
    });
    return workbook;
  }

  private addBatchesSheet(
    workbook: Workbook,
    rows: BatchExportRow[],
    mainRowsByVariant: ReadonlyMap<string, number>
  ): ReadonlyMap<string, number> {
    const sheet = workbook.addWorksheet('Batches', {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 13 }],
      properties: { tabColor: { argb: 'ED7D31' } },
    });
    const batchColumn = (header: BatchHeader) => BATCH_HEADERS.indexOf(header) + 1;
    const mainColumn = (header: PriceUpdateHeader) => PRICE_UPDATE_HEADERS.indexOf(header) + 1;
    const mainSheet = workbook.getWorksheet('Products & Stock')!;
    const linkedValue = (header: PriceUpdateHeader, mainRow: number, result: unknown) => ({
      formula: `'Products & Stock'!${mainSheet.getColumn(mainColumn(header)).letter}${mainRow}`,
      result,
    });

    sheet.addTable({
      name: 'DukaRunOpenBatches',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium9', showRowStripes: true },
      columns: BATCH_HEADERS.map(name => ({ name })),
      rows: rows.map(row => {
        const mainRow = mainRowsByVariant.get(row.variant_id) ?? 0;
        return [
          row.id,
          row.variant_id,
          row.stock_location_id,
          row.latest,
          mainRow,
          row.remaining,
          row.unit_cost,
          row.remaining_cost,
          row.batch_number ?? '',
          row.expiry_date ?? '',
          row.product_name,
          row.manufacturer_name ?? '',
          row.variant_name === 'Default' ? '' : row.variant_name,
          row.sku,
          row.latest ? `Latest — ${row.label}` : row.label,
          row.purchased_at.slice(0, 10),
          row.remaining,
          row.latest && mainRow
            ? linkedValue('latest_batch_number', mainRow, row.batch_number ?? '')
            : (row.batch_number ?? ''),
          row.latest && mainRow
            ? linkedValue('latest_buying_price_kes', mainRow, row.unit_cost)
            : row.unit_cost,
          row.latest && mainRow
            ? linkedValue('latest_expiry_date', mainRow, row.expiry_date ?? '')
            : (row.expiry_date ?? ''),
        ];
      }),
    });
    BATCH_HEADERS.forEach((header, index) => {
      const widths: Partial<Record<BatchHeader, number>> = {
        product_name: 28,
        manufacturer: 24,
        variant_name: 22,
        sku: 20,
        batch: 36,
        received_date: 18,
        remaining_quantity: 24,
        batch_number: 24,
        buying_price_kes: 24,
        expiry_date: 20,
      };
      sheet.getColumn(index + 1).width = widths[header] ?? 18;
    });
    for (const header of BATCH_HEADERS.slice(0, 10)) {
      sheet.getColumn(batchColumn(header)).hidden = true;
    }
    for (const header of [
      'expected_current_unit_cost_kes',
      'expected_remaining_value_kes',
      'buying_price_kes',
    ] satisfies BatchHeader[]) {
      sheet.getColumn(batchColumn(header)).numFmt = '#,##0';
    }
    for (const header of [
      'expected_remaining_quantity',
      'remaining_quantity',
    ] satisfies BatchHeader[]) {
      sheet.getColumn(batchColumn(header)).numFmt = '#,##0.###';
    }
    for (const header of [
      'expected_expiry_date',
      'received_date',
      'expiry_date',
    ] satisfies BatchHeader[]) {
      sheet.getColumn(batchColumn(header)).numFmt = 'yyyy-mm-dd';
    }

    const rowNumbers = new Map<string, number>();
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      rowNumbers.set(row.id, rowNumber);
      const batchLink = sheet.getCell(rowNumber, batchColumn('batch'));
      const mainRow = mainRowsByVariant.get(row.variant_id);
      if (mainRow) {
        batchLink.value = {
          text: row.latest ? `Latest — ${row.label}` : row.label,
          hyperlink: `#'Products & Stock'!${mainSheet.getColumn(mainColumn('product_name')).letter}${mainRow}`,
          tooltip: row.latest ? 'Edit this latest batch on Products & Stock' : 'Open this product',
        };
        batchLink.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
      for (const header of [
        'batch_number',
        'buying_price_kes',
        'expiry_date',
      ] satisfies BatchHeader[]) {
        const cell = sheet.getCell(rowNumber, batchColumn(header));
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: row.latest ? 'FFDDEBF7' : 'FFFFF2CC' },
        };
        if (row.latest) {
          cell.note = 'Linked to Products & Stock. Edit the latest batch on the main sheet.';
        }
      }
      if (!row.latest) {
        sheet.getCell(rowNumber, batchColumn('buying_price_kes')).dataValidation = {
          type: 'whole',
          operator: 'greaterThanOrEqual',
          allowBlank: false,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Invalid buying price',
          error: 'Enter a whole amount of zero or greater.',
        };
      } else {
        sheet.getRow(rowNumber).font = { bold: true };
      }
      if (row.unit_cost === 0) {
        const priceCell = sheet.getCell(rowNumber, batchColumn('buying_price_kes'));
        priceCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF4CCCC' },
        };
        priceCell.font = { bold: true, color: { argb: 'FF9C0006' } };
      }
    });
    return rowNumbers;
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
      workbookKind: 'catalog_workbook';
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
    const missing = PRICE_UPDATE_HEADERS.filter(header => !actual.has(header));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
    return new Map(
      PRICE_UPDATE_HEADERS.flatMap(header => {
        const column = actual.get(header);
        return column ? ([[header, column]] as Array<[PriceUpdateHeader, number]>) : [];
      })
    );
  }

  private batchHeaderMap(sheet: Worksheet): Map<BatchHeader, number> {
    const actual = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => actual.set(cell.text.trim(), column));
    const missing = BATCH_HEADERS.filter(header => !actual.has(header));
    if (missing.length) throw new Error(`Batches missing columns: ${missing.join(', ')}`);
    return new Map(
      BATCH_HEADERS.map(header => [header, actual.get(header)!] as [BatchHeader, number])
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
      throw new Error('manufacturer must be between 1 and 120 characters or CLEAR');
    }
    return name;
  }

  private normalizedManufacturer(value: string | null): string {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private assertListedManufacturer(value: string | null, allowedNames: ReadonlySet<string>): void {
    if (value !== null && !allowedNames.has(this.normalizedManufacturer(value))) {
      throw new Error('manufacturer must be selected from the Manufacturers sheet');
    }
  }

  private batchNumber(value: unknown, name: string): string | null {
    const result = this.text(value);
    if (!result) return null;
    if (result.length > 120) throw new Error(`${name} must be 120 characters or fewer`);
    return result;
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

  private batchRowLabel(row: import('exceljs').Row, headers: Map<BatchHeader, number>): string {
    const product = this.text(row.getCell(headers.get('product_name')!).value) || 'Product';
    const variant = this.text(row.getCell(headers.get('variant_name')!).value);
    const sku = this.text(row.getCell(headers.get('sku')!).value);
    const batch = this.text(row.getCell(headers.get('batch')!).value);
    return [product, variant, sku, batch].filter(Boolean).join(' — ');
  }

  private batchLabel(batch: Pick<InventoryBatchRow, 'batch_number' | 'purchased_at'>): string {
    const received = batch.purchased_at.slice(0, 10);
    return batch.batch_number?.trim()
      ? `${batch.batch_number.trim()} · received ${received}`
      : `Received ${received}`;
  }

  private compareBatchesNewestFirst(left: InventoryBatchRow, right: InventoryBatchRow): number {
    return (
      right.purchased_at.localeCompare(left.purchased_at) ||
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id)
    );
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
        .select('id,name,active')
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

  private async allOpenBatches(stockLocationId: string): Promise<InventoryBatchRow[]> {
    return this.allPages(offset =>
      this.supabase.client
        .from('inventory_batches')
        .select(
          'id,variant_id,stock_location_id,batch_number,expiry_date,purchased_at,created_at,quantity,remaining,unit_cost,original_cost,remaining_cost'
        )
        .eq('stock_location_id', stockLocationId)
        .gt('remaining', 0)
        .order('purchased_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 999)
    ) as Promise<InventoryBatchRow[]>;
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
