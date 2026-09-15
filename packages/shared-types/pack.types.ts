/**
 * A variant-owned selling/buying unit sharing the variant's stock balance.
 * Contents are immutable whole base units; reuse across variants means copying,
 * so prices, barcodes and later edits remain independent for each stock identity.
 */
export interface ProductPack {
  id: string;
  name: string;
  units_per_pack: number;
  /** Fixed price for the complete pack, independent of wholesale; null means purchase-only. */
  sale_price: number | null;
  barcode: string | null;
  /** Retire instead of deleting: historical and queued transactions retain this identity. */
  active: boolean;
  available?: boolean;
}

export interface PackCatalogue {
  stock_unit?: string | null;
  packs?: ProductPack[] | null;
}

export interface SellingUnit {
  packId: string | null;
  name: string;
  stockUnit: string;
  factor: number;
  price: number;
}

export function sellingUnits(variant: PackCatalogue & { price: number | null }): SellingUnit[] {
  const stockUnit = variant.stock_unit?.trim() || 'item';
  return [
    { packId: null, name: stockUnit, stockUnit, factor: 1, price: variant.price ?? 0 },
    ...(variant.packs ?? [])
      .filter(pack => pack.active && pack.sale_price !== null)
      .map(pack => ({
        packId: pack.id,
        name: pack.name,
        stockUnit,
        factor: pack.units_per_pack,
        price: pack.sale_price!,
      })),
  ];
}

export function unitDescription(unit: Pick<SellingUnit, 'name' | 'factor' | 'stockUnit'>): string {
  return unit.factor === 1 ? unit.name : `${unit.name} · ${unit.factor} ${unit.stockUnit}`;
}

/** Comparison only: never use this value to set or validate a price. */
export function packWholesaleComparison(
  price: number,
  factor: number,
  wholesale: number | null
): string {
  if (!wholesale || wholesale <= 0 || factor <= 0) return '';
  const difference = 100 * (1 - price / (factor * wholesale));
  if (Math.abs(difference) < 0.05) return 'Equal to wholesale equivalent';
  return `${Math.abs(difference).toLocaleString('en-KE', { maximumFractionDigits: 1 })}% ${difference > 0 ? 'below' : 'above'} wholesale equivalent`;
}

/** Historical document labels must use the snapshot, never today's pack. */
export function transactionUnitLabel(line: {
  unit_name?: string | null;
  units_per_unit?: number | null;
  stock_unit_name?: string | null;
}): string {
  const name = line.unit_name || 'item';
  const factor = line.units_per_unit ?? 1;
  return factor === 1 ? name : `${name} (${factor} ${line.stock_unit_name || 'item'})`;
}
