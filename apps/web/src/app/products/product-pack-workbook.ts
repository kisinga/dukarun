import type { Workbook } from 'exceljs';
import type { PackCatalogue, ProductPack } from '@dukarun/pack-types';

/**
 * Version 6 workbook edits retain the exported baseline for server-side stale checks.
 * Omitted rows preserve packs; active=false retires them. New products need a fresh
 * export after creation so pack rows have a persistent variant identity.
 */
export interface CatalogPackChange {
  variant_id: string;
  product_name: string;
  stock_unit: string;
  expected_packs: ProductPack[];
  packs: ProductPack[];
}

const columns = [
  'variant_id',
  'expected_packs',
  'product',
  'stock_unit',
  'pack_id',
  'pack_name',
  'units_per_pack',
  'selling_price_kes',
  'barcode',
  'active',
];

export function addPackWorksheet(
  workbook: Workbook,
  variants: Array<
    PackCatalogue & {
      variant_id?: string | null;
      product_name?: string | null;
      sku?: string | null;
      kind?: string | null;
      allow_fractional?: boolean | null;
    }
  >
): void {
  const sheet = workbook.addWorksheet('Packs');
  sheet.columns = columns.map(key => ({ header: key, key, width: key === 'product' ? 32 : 22 }));
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(2).hidden = true;
  sheet.getColumn(5).hidden = true;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const variant of variants.filter(v => v.kind !== 'service' && !v.allow_fractional)) {
    const packs = variant.packs ?? [];
    for (const pack of packs.length ? packs : [null]) {
      sheet.addRow([
        variant.variant_id,
        JSON.stringify(packs),
        `${variant.product_name} · ${variant.sku}`,
        variant.stock_unit || 'item',
        pack?.id ?? '',
        pack?.name ?? '',
        pack?.units_per_pack ?? '',
        pack?.sale_price ?? '',
        pack?.barcode ?? '',
        pack?.active ?? true,
      ]);
    }
  }
  sheet.getRow(1).font = { bold: true };
  for (let row = 2; row <= sheet.rowCount; row++) {
    for (let col = 6; col <= 10; col++)
      sheet.getCell(row, col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF2CC' },
      };
  }
}

/** Omitted rows preserve packs. Explicit active=false retires them. */
export function readPackChanges(workbook: Workbook, errors: string[]): CatalogPackChange[] {
  const sheet = workbook.getWorksheet('Packs');
  if (!sheet) return [];
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => headers.set(cell.text.trim(), col));
  if (columns.some(key => !headers.has(key))) {
    errors.push('Packs: download a fresh workbook with all pack columns.');
    return [];
  }
  const groups = new Map<string, CatalogPackChange>();
  const seen = new Set<string>();
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const text = (key: string) => {
      const cell = row.getCell(headers.get(key)!);
      if (cell.type === 6) throw new Error('paste values instead of formulas');
      return cell.text.trim();
    };
    try {
      const name = text('pack_name');
      if (!name && !text('pack_id')) return;
      const id = text('pack_id') || crypto.randomUUID();
      const variant = text('variant_id');
      if (!/^[0-9a-f-]{36}$/i.test(variant) || !/^[0-9a-f-]{36}$/i.test(id))
        throw new Error('invalid pack or variant identity');
      if (seen.has(id)) throw new Error('duplicate pack row; clear pack_id to create a new pack');
      seen.add(id);
      const baseline = JSON.parse(text('expected_packs')) as ProductPack[];
      if (!Array.isArray(baseline)) throw new Error('missing original pack definitions');
      let change = groups.get(variant);
      if (!change) {
        change = {
          variant_id: variant,
          product_name: text('product'),
          stock_unit: text('stock_unit') || 'item',
          expected_packs: baseline,
          packs: baseline.map(pack => ({ ...pack })),
        };
        groups.set(variant, change);
      } else if (JSON.stringify(change.expected_packs) !== JSON.stringify(baseline))
        throw new Error('inconsistent original pack definitions');
      const factor = Number(text('units_per_pack'));
      const price = text('selling_price_kes') ? Number(text('selling_price_kes')) : null;
      const active = text('active').toLowerCase();
      if (!name || name.length > 80 || !Number.isSafeInteger(factor) || factor <= 1)
        throw new Error('enter a pack name and whole contents greater than one');
      if (price !== null && (!Number.isSafeInteger(price) || price <= 0))
        throw new Error('selling price must be positive whole KES, or blank for purchase only');
      if (!['true', 'false'].includes(active)) throw new Error('active must be TRUE or FALSE');
      const existing = change.packs.find(pack => pack.id === id);
      if (existing && existing.units_per_pack !== factor)
        throw new Error('contents are fixed; retire this pack and add a new one');
      const pack: ProductPack = {
        id,
        name,
        units_per_pack: factor,
        sale_price: price,
        barcode: text('barcode') || null,
        active: active === 'true',
      };
      if (existing) Object.assign(existing, pack);
      else change.packs.push(pack);
    } catch (error) {
      errors.push(`Packs row ${index}: ${error instanceof Error ? error.message : 'invalid row'}`);
    }
  });
  return [...groups.values()].filter(
    change => JSON.stringify(change.packs) !== JSON.stringify(change.expected_packs)
  );
}
