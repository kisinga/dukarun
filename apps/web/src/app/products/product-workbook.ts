import type { ProductPack } from '@dukarun/pack-types';

export const WORKBOOK_FORMAT = 'dukarun-products-1';
export const START_ROW = 6;
export const MAX_ROWS = 10_000;
export const EXTRA_ROWS = 50;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const BLOCKED = 'XXXX';
export const HEADERS = [
  'Product',
  'Manufacturer',
  'Size / type',
  'Sold as',
  'Retail now',
  'New retail',
  'Wholesale now',
  'New wholesale',
  'Buying now',
  'New buying',
  'Stock now',
  'Counted stock',
  'SKU',
  'Barcode',
  'Product barcode',
  'Item type',
  'Track stock?',
  'Allow fractions?',
  'Tax category',
  'Product active?',
  'Selling option active?',
  'Batch number',
  'Expiry date',
  'Stock value KES',
  'Latest batch quantity',
  'Latest batch value KES',
  'Revised batch value KES',
  '_row_key',
  '_manufacturer_id',
  '_size_id',
  '_family',
  '_single',
  '_unit',
  '_factor',
  '_mode',
] as const;

export interface WorkbookProduct {
  id: string;
  name: string;
  barcode: string | null;
  active: boolean;
  manufacturer_id: string | null;
  tax_category_id: string | null;
  updated_at: string;
}
export interface WorkbookVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  barcode: string | null;
  kind: 'good' | 'service';
  price: number;
  wholesale_price: number | null;
  stock_unit: string;
  track_inventory: boolean;
  allow_fractional: boolean;
  active: boolean;
  updated_at: string;
}
export interface WorkbookManufacturer {
  id: string;
  name: string;
  active: boolean;
  updated_at: string;
}
export interface WorkbookPack extends ProductPack {
  variant_id: string;
}
export interface WorkbookStock {
  variant_id: string;
  quantity: number;
  value?: number;
  batch: WorkbookBatch | null;
}
export interface WorkbookBatch {
  id: string;
  remaining: number;
  unit_cost: number;
  remaining_cost: number;
  batch_number: string | null;
  expiry_date: string | null;
}
export interface WorkbookSnapshot {
  company_id: string;
  company_name: string;
  exported_at: string;
  location: { id: string; code: string; name: string };
  capabilities: { stock: boolean; financial: boolean };
  products: WorkbookProduct[];
  variants: WorkbookVariant[];
  packs: WorkbookPack[];
  manufacturers: WorkbookManufacturer[];
  taxes: { id: string; code: string }[];
  stock: WorkbookStock[];
}
export interface PackSize {
  id: string;
  name: string;
  pieces: number;
}
export interface UnitChoice {
  key: string;
  unit: string;
  label: string;
  plural: string;
  fractional: boolean;
  kind: 'good' | 'service';
}
export interface ManufacturerEdit {
  key: string;
  id: string | null;
  expected_updated_at: string | null;
  name: string;
  active: boolean;
}
export interface VariantEdit {
  key: string;
  id: string | null;
  expected_updated_at: string | null;
  values: Omit<WorkbookVariant, 'id' | 'product_id' | 'updated_at'>;
  packs: ProductPack[];
  expected_packs: ProductPack[];
  opening_quantity?: number;
  opening_unit_cost?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}
export interface ProductEdit {
  key: string;
  id: string | null;
  expected_updated_at: string | null;
  values: Omit<WorkbookProduct, 'id' | 'manufacturer_id' | 'updated_at'> & {
    manufacturer_key: string | null;
  };
  variants: VariantEdit[];
}
export interface StockEdit {
  variant_id: string;
  stock_location_id: string;
  expected_stock_quantity: number;
  new_stock_quantity: number;
}
export interface BatchEdit {
  action: 'create' | 'update';
  batch_id?: string;
  variant_id: string;
  stock_location_id: string;
  latest: true;
  expected_remaining: number;
  expected_unit_cost: number;
  expected_remaining_cost: number;
  expected_batch_number: string | null;
  expected_expiry_date: string | null;
  new_unit_cost: number;
  new_remaining_cost?: number;
  new_batch_number: string | null;
  new_expiry_date: string | null;
  quantity_added: number;
}
export interface WorkbookChanges {
  format: typeof WORKBOOK_FORMAT;
  company_id: string;
  location_id: string;
  manufacturers: ManufacturerEdit[];
  products: ProductEdit[];
  stock: StockEdit[];
  batches: BatchEdit[];
}
export interface WorkbookPreviewLine {
  sheet: string;
  row: number;
  product: string;
  option: string;
  field: string;
  before: string;
  after: string;
}
export interface ProductWorkbookPreview {
  requestId: string;
  fileName: string;
  rows: number;
  changes: WorkbookChanges;
  lines: WorkbookPreviewLine[];
  errors: string[];
  conflicts: string[];
}
export interface ProductWorkbookResult {
  products_created: number;
  products_updated: number;
  variants_created: number;
  variants_updated: number;
  manufacturers_changed: number;
  packs_changed: number;
  stock_changes: number;
  batch_changes: number;
}

export const normalized = (text: string): string => text.trim().toLowerCase();
export const variantName = (text: string): string =>
  normalized(text) === 'default' ? '' : text.trim();
export const familyKey = (name: string, maker: string, variant: string): string =>
  JSON.stringify([normalized(name), normalized(maker), normalized(variantName(variant))]);
export function packSizes(snapshot: WorkbookSnapshot): PackSize[] {
  const result = new Map<string, PackSize>();
  for (const pack of snapshot.packs) {
    const key = JSON.stringify([pack.name, pack.units_per_pack]);
    if (!result.has(key))
      result.set(key, {
        id: `size-${result.size + 1}`,
        name: pack.name,
        pieces: pack.units_per_pack,
      });
  }
  return [...result.values()];
}
export function unitChoices(snapshot: WorkbookSnapshot): UnitChoice[] {
  const units = new Map<string, UnitChoice>();
  const plurals: Record<string, string> = {
    item: 'items',
    piece: 'pieces',
    bar: 'bars',
    bottle: 'bottles',
    packet: 'packets',
    egg: 'eggs',
  };
  const measured = new Set(['kg', 'g', 'l', 'litre', 'ml', 'm']);
  const add = (unit: string, fractional: boolean, kind: 'good' | 'service') => {
    const id = JSON.stringify([unit, fractional, kind]);
    if (units.has(id)) return;
    let label =
      kind === 'service'
        ? 'Per service'
        : measured.has(unit.toLowerCase()) || fractional
          ? `Per ${unit}`
          : `Single ${unit}`;
    if ([...units.values()].some(choice => choice.label === label))
      label += fractional ? ' (fractions)' : ' (whole quantities)';
    units.set(id, {
      key: `Unit${units.size + 1}`,
      unit,
      label,
      plural: plurals[unit] ?? unit,
      fractional,
      kind,
    });
  };
  for (const unit of [
    'item',
    'piece',
    'bar',
    'bottle',
    'packet',
    'egg',
    'kg',
    'g',
    'litre',
    'ml',
    'm',
  ])
    add(unit, measured.has(unit), 'good');
  add('item', false, 'service');
  for (const variant of snapshot.variants)
    add(variant.stock_unit, variant.allow_fractional, variant.kind);
  return [...units.values()];
}
export function choiceFor(variant: WorkbookVariant, choices: UnitChoice[]): UnitChoice {
  return choices.find(
    choice =>
      choice.unit === variant.stock_unit &&
      choice.fractional === variant.allow_fractional &&
      choice.kind === variant.kind
  )!;
}
export const packLabel = (size: Pick<PackSize, 'name' | 'pieces'>, choice: UnitChoice): string =>
  `${size.name} of ${size.pieces} ${choice.plural}`;
export function plainPack(pack: ProductPack): ProductPack {
  return {
    id: pack.id,
    name: pack.name,
    units_per_pack: pack.units_per_pack,
    sale_price: pack.sale_price,
    barcode: pack.barcode ?? null,
    active: pack.active,
  };
}
