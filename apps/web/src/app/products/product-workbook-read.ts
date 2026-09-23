import type { Cell, Row, Workbook } from 'exceljs';
import { parseUnitCost } from '../core/money';
import {
  BLOCKED,
  HEADERS,
  MAX_ROWS,
  START_ROW,
  WORKBOOK_FORMAT,
  choiceFor,
  familyKey,
  normalized,
  packLabel,
  packSizes,
  plainPack,
  unitChoices,
  variantName,
  type PackSize,
  type ProductEdit,
  type ProductWorkbookPreview,
  type UnitChoice,
  type VariantEdit,
  type WorkbookManufacturer,
  type WorkbookPack,
  type WorkbookProduct,
  type WorkbookSnapshot,
  type WorkbookVariant,
} from './product-workbook';
import { inputFormula, makerFormula, soldFormula } from './product-workbook-export';

const equal = (a: unknown, b: unknown): boolean =>
  JSON.stringify(
    a,
    Object.keys((a && typeof a === 'object' && !Array.isArray(a) ? a : {}) as object).sort()
  ) ===
  JSON.stringify(
    b,
    Object.keys((b && typeof b === 'object' && !Array.isArray(b) ? b : {}) as object).sort()
  );
const text = (value: unknown): string => (value == null ? '' : String(value).trim());
const blank = (value: unknown): boolean => value == null || value === '' || value === BLOCKED;
const display = (value: unknown): string =>
  value == null || value === ''
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : String(value);
// Spreadsheet applications remove optional quotes around simple sheet names.
// Accept that spelling change only; formulas still have to match our emitted expressions.
const sameFormula = (actual: string, expected: string): boolean =>
  actual.replace(/'([A-Za-z_][A-Za-z0-9_]*)'!/g, '$1!') ===
  expected.replace(/'([A-Za-z_][A-Za-z0-9_]*)'!/g, '$1!');
function literal(cell: Cell): string | number | boolean | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  throw new Error(`${cell.address}: paste a value; this cell cannot contain a formula or error.`);
}
function number(value: unknown, label: string, fractional = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !text(value))
    throw new Error(`${label}: enter a number.`);
  const n = Number(text(value).replaceAll(',', ''));
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > (fractional ? 99999999999.999 : Number.MAX_SAFE_INTEGER) ||
    (fractional ? Math.abs(n * 1000 - Math.round(n * 1000)) > 0.0001 : !Number.isSafeInteger(n))
  )
    throw new Error(
      `${label}: enter a nonnegative ${fractional ? 'quantity with at most 3 decimal places' : 'whole number'}.`
    );
  return n;
}
function bool(value: unknown, fallback: boolean, label: string): boolean {
  if (blank(value)) return fallback;
  if (['yes', 'true'].includes(normalized(text(value)))) return true;
  if (['no', 'false'].includes(normalized(text(value)))) return false;
  throw new Error(`${label}: choose Yes or No.`);
}
function optional(value: unknown, max: number, label: string): string | null {
  const result = text(value);
  if (result.length > max) throw new Error(`${label}: use ${max} characters or fewer.`);
  return result || null;
}
function date(value: unknown): string | null {
  const result = text(value);
  if (!result) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error('Expiry date: use a valid YYYY-MM-DD date.');
  return result;
}
export function readBaseline(book: Workbook): {
  snapshot: WorkbookSnapshot;
  capacity: number;
  references: number;
} {
  const ws = book.getWorksheet('_Original');
  const fresh = 'Download a fresh Products workbook. This file format is not supported.';
  if (!ws || ws.getCell('B1').value !== WORKBOOK_FORMAT) throw new Error(fresh);
  try {
    const scope = JSON.parse(text(literal(ws.getCell('B2'))));
    const snapshot: WorkbookSnapshot = {
      ...scope,
      products: [],
      variants: [],
      packs: [],
      manufacturers: [],
      taxes: [],
      stock: [],
    };
    ws.eachRow((row, n) => {
      if (n < 3) return;
      const kind = text(literal(row.getCell(1)));
      if (!['products', 'variants', 'packs', 'manufacturers', 'taxes', 'stock'].includes(kind))
        throw new Error(fresh);
      (snapshot[kind as 'products'] as unknown[]).push(JSON.parse(text(literal(row.getCell(2)))));
    });
    if (
      !snapshot.company_id ||
      !snapshot.location?.id ||
      !snapshot.capabilities ||
      !Number.isInteger(scope.capacity) ||
      scope.capacity < 0 ||
      scope.capacity > MAX_ROWS ||
      !Number.isInteger(scope.references) ||
      scope.references < 1 ||
      scope.references > MAX_ROWS + 50
    )
      throw new Error(fresh);
    return { snapshot, capacity: scope.capacity, references: scope.references };
  } catch {
    throw new Error(fresh);
  }
}
const productValues = (p: WorkbookProduct): ProductEdit['values'] => ({
  name: p.name,
  barcode: p.barcode,
  active: p.active,
  manufacturer_key: p.manufacturer_id,
  tax_category_id: p.tax_category_id,
});
const variantValues = (v: WorkbookVariant): VariantEdit['values'] => ({
  name: v.name,
  sku: v.sku,
  barcode: v.barcode,
  kind: v.kind,
  price: v.price,
  wholesale_price: v.wholesale_price,
  stock_unit: v.stock_unit,
  track_inventory: v.track_inventory,
  allow_fractional: v.allow_fractional,
  active: v.active,
});
interface Entry {
  row: Row;
  key: string;
  variant?: WorkbookVariant;
  pack?: WorkbookPack;
  product?: WorkbookProduct;
  name: string;
  maker: string | null;
  size: string;
  sold: string;
  choice?: UnitChoice;
  owner?: VariantEdit;
  parent?: ProductEdit;
}

export function readProductWorkbook(
  book: Workbook,
  fileName: string,
  live: WorkbookSnapshot
): ProductWorkbookPreview {
  const { snapshot: original, capacity, references } = readBaseline(book);
  const result: ProductWorkbookPreview = {
    requestId: crypto.randomUUID(),
    fileName,
    rows: 0,
    changes: {
      format: WORKBOOK_FORMAT,
      company_id: original.company_id,
      location_id: original.location.id,
      manufacturers: [],
      products: [],
      stock: [],
      batches: [],
    },
    lines: [],
    errors: [],
    conflicts: [],
  };
  if (original.company_id !== live.company_id || original.location.id !== live.location.id)
    throw new Error(
      'This workbook belongs to a different shop or stock location. Download a fresh workbook for this location.'
    );
  const main = book.getWorksheet('Products'),
    makersSheet = book.getWorksheet('Manufacturers'),
    sizesSheet = book.getWorksheet('Pack sizes');
  if (
    !main ||
    !makersSheet ||
    !sizesSheet ||
    book.worksheets.filter(s => s.state === 'visible').length !== 3
  )
    throw new Error(
      'Keep the Products, Manufacturers and Pack sizes sheets. Download a fresh workbook.'
    );
  for (const [i, header] of HEADERS.entries()) {
    const actual = main.getCell(5, i + 1).value;
    // The labels became explicit without changing the workbook's columns or values.
    const previousBuyingHeader =
      (i === 8 && actual === 'Buying now') || (i === 9 && actual === 'New buying');
    if (actual !== header && !previousBuyingHeader)
      throw new Error(`Products: missing or renamed column ${header}. Download a fresh workbook.`);
  }
  if (original.variants.length + original.packs.length > MAX_ROWS)
    throw new Error(`Maximum ${MAX_ROWS} selling-option rows.`);
  const attempt = (sheet: string, row: number, action: () => void) => {
    try {
      action();
    } catch (error) {
      result.errors.push(
        `${sheet} row ${row}: ${error instanceof Error ? error.message : 'invalid row'}`
      );
    }
  };
  const line = (entry: Entry, field: string, before: unknown, after: unknown) => {
    if (!equal(before, after))
      result.lines.push({
        sheet: 'Products',
        row: entry.row.number,
        product: entry.name,
        option: [entry.size, entry.sold].filter(Boolean).join(' · '),
        field,
        before:
          field === 'Manufacturer'
            ? (original.manufacturers.find(m => m.id === before)?.name ?? '—')
            : display(before),
        after: field === 'Manufacturer' ? (makers.get(String(after))?.name ?? '—') : display(after),
      });
  };
  const makers = new Map<string, WorkbookManufacturer>(
    original.manufacturers.map(m => [m.id, { ...m }])
  );
  const sizes = new Map<string, PackSize>(packSizes(original).map(s => [s.id, { ...s }]));
  for (const [ws, headers] of [
    [makersSheet, ['Manufacturer name', 'Available?', 'At export', '_choice', '_reference_id']],
    [sizesSheet, ['Pack name', 'Items in this pack', 'At export', '_reserved', '_reference_id']],
  ] as const) {
    for (const [i, header] of headers.entries())
      if (ws.getCell(5, i + 1).value !== header)
        throw new Error(`${ws.name}: keep the original column headings.`);
    const seen = new Set<string>();
    ws.eachRow((row, n) => {
      if (n < START_ROW || (!text(row.getCell(1).value) && !text(row.getCell(2).value))) return;
      attempt(ws.name, n, () => {
        if (n > references + 5)
          throw new Error(
            'Use a prepared blank reference row, or download a fresh workbook with more space.'
          );
        const name = optional(literal(row.getCell(1)), ws === makersSheet ? 120 : 80, 'Name');
        if (!name) throw new Error('Name is required.');
        const key = text(literal(row.getCell(5)));
        if (!key || seen.has(key))
          throw new Error(
            'Missing or duplicated reference identity. Use a prepared blank row for a new entry.'
          );
        seen.add(key);
        if (ws === makersSheet) {
          const old = makers.get(key);
          if (!old && !/^new-maker-\d+$/.test(key))
            throw new Error('Invalid manufacturer identity.');
          const active = bool(literal(row.getCell(2)), old?.active ?? true, 'Available?');
          if (text(literal(row.getCell(3))) !== (old?.name ?? ''))
            throw new Error('At export is a reference. Edit Manufacturer name instead.');
          makers.set(key, { id: key, name, active, updated_at: old?.updated_at ?? '' });
          if (!old || old.name !== name || old.active !== active) {
            result.changes.manufacturers.push({
              key,
              id: old?.id ?? null,
              expected_updated_at: old?.updated_at ?? null,
              name,
              active,
            });
            const affected = old
              ? live.products.filter(p => p.manufacturer_id === old.id).length
              : 0;
            result.lines.push({
              sheet: ws.name,
              row: n,
              product: name,
              option: old ? `${affected} linked products in this shop` : 'New manufacturer',
              field: 'Name / availability',
              before: old ? `${old.name} / ${display(old.active)}` : 'New',
              after: `${name} / ${display(active)}`,
            });
          }
        } else {
          const old = sizes.get(key),
            pieces = number(literal(row.getCell(2)), 'Items in this pack');
          if (pieces < 2 || pieces >= 100000000000)
            throw new Error('Items in this pack must be a whole number greater than one.');
          if (!old && !/^new-size-\d+$/.test(key)) throw new Error('Invalid pack-size identity.');
          if (old && old.pieces !== pieces)
            throw new Error('Existing contents are fixed. Add a new pack definition.');
          if (text(literal(row.getCell(3))) !== (old ? `${old.name} · ${old.pieces}` : ''))
            throw new Error('At export is a reference. Edit Pack name instead.');
          sizes.set(key, { id: key, name, pieces });
        }
      });
    });
  }
  const makerNames = new Map<string, string[]>();
  for (const m of makers.values())
    makerNames.set(normalized(m.name), [...(makerNames.get(normalized(m.name)) ?? []), m.id]);
  for (const [name, ids] of makerNames)
    if (ids.length > 1)
      result.errors.push(
        `Manufacturers: duplicate name “${name}”. Use one reference per manufacturer.`
      );
  const sizeNames = new Set<string>();
  for (const size of sizes.values()) {
    // Match the reference identity used by packSizes() and the Sold as labels.
    const key = JSON.stringify([size.name, size.pieces]);
    if (sizeNames.has(key))
      result.errors.push(
        `Pack sizes: duplicate ${size.name} / ${size.pieces}. Use one definition.`
      );
    sizeNames.add(key);
  }
  const products = new Map(original.products.map(p => [p.id, p]));
  const variants = new Map(original.variants.map(v => [v.id, v]));
  const packById = new Map(original.packs.map(p => [p.id, p]));
  const packsByVariant = new Map<string, WorkbookPack[]>();
  for (const pack of original.packs) {
    const list = packsByVariant.get(pack.variant_id) ?? [];
    list.push(pack);
    packsByVariant.set(pack.variant_id, list);
  }
  const stockByVariant = new Map(original.stock.map(s => [s.variant_id, s]));
  const choices = unitChoices(original);
  const productEdits = new Map<string, ProductEdit>(),
    variantEdits = new Map<string, VariantEdit>();
  const entries: Entry[] = [],
    seenRows = new Set<string>();
  const getProduct = (p: WorkbookProduct): ProductEdit => {
    let edit = productEdits.get(p.id);
    if (!edit) {
      edit = {
        key: p.id,
        id: p.id,
        expected_updated_at: p.updated_at,
        values: productValues(p),
        variants: [],
      };
      productEdits.set(p.id, edit);
    }
    return edit;
  };
  const getVariant = (v: WorkbookVariant): VariantEdit => {
    let edit = variantEdits.get(v.id);
    if (!edit) {
      const packs = (packsByVariant.get(v.id) ?? []).map(plainPack);
      edit = {
        key: v.id,
        id: v.id,
        expected_updated_at: v.updated_at,
        values: variantValues(v),
        packs: packs.map(p => ({ ...p })),
        expected_packs: packs,
      };
      variantEdits.set(v.id, edit);
    }
    return edit;
  };
  const deliberate = new Map<string, unknown>();
  const merge = <T extends object, K extends keyof T>(
    entry: Entry,
    key: string,
    target: T,
    field: K,
    before: T[K],
    after: T[K],
    label: string
  ) => {
    if (equal(before, after)) return;
    const id = `${key}/${String(field)}`;
    if (deliberate.has(id) && !equal(deliberate.get(id), after))
      throw new Error(
        `${label}: conflicting edits on rows for the same record. Enter one consistent change.`
      );
    if (!deliberate.has(id)) line(entry, label, before, after);
    deliberate.set(id, after);
    target[field] = after;
  };
  // Keep prepared formulas from older exports valid when their lookup list
  // omitted packs for fractional base units. Evaluate defaults from the base row.
  const choiceRanges = [true, false].map(
    fractionalPacks =>
      `'_Choices'!$A$2:$F$${1 + choices.reduce((sum, choice) => sum + 1 + (choice.kind === 'good' && (fractionalPacks || !choice.fractional) ? references : 0), 0)}`
  );
  const raw = (entry: Entry, c: number): string | number | boolean | null => {
    const cell = entry.row.getCell(c),
      n = entry.row.number;
    if (!cell.formula) return literal(cell);
    if ([8, 10, 12, 27].includes(c) && cell.formula === inputFormula(n, c, original)) return '';
    if (!entry.variant) {
      const preparedDefault = choiceRanges.some(choiceRange => {
        const defaults: Record<number, string> = {
          16: `IF(A${n}="","",IFERROR(IF(VLOOKUP(D${n},${choiceRange},5,FALSE())="service","Service","Good"),"Good"))`,
          17: `IF(A${n}="","",IF(P${n}="Service","No","Yes"))`,
          18: `IF(A${n}="","",IFERROR(IF(VLOOKUP(D${n},${choiceRange},6,FALSE()),"Yes","No"),"No"))`,
        };
        return !!defaults[c] && sameFormula(cell.formula!, defaults[c]);
      });
      if (preparedDefault)
        return c === 16
          ? entry.choice?.kind === 'service'
            ? 'Service'
            : 'Good'
          : c === 18
            ? entry.choice?.fractional
              ? 'Yes'
              : 'No'
            : normalized(text(raw(entry, 16))) === 'service'
              ? 'No'
              : 'Yes';
    }
    throw new Error(
      `${HEADERS[c - 1]}: unsupported formula. Paste a value or restore the exported formula.`
    );
  };
  main.eachRow((row, n) => {
    if (n < START_ROW) return;
    // Prepared formulas/defaults do not constitute an entry; partially filled identities do.
    const entered = [1, 2, 3, 4, 6, 8, 10, 12, 13, 14, 28].some(
      c => !row.getCell(c).formula && !blank(row.getCell(c).value)
    );
    if (!entered) return;
    result.rows++;
    attempt('Products', n, () => {
      if (n > capacity + 5 || result.rows > MAX_ROWS)
        throw new Error(
          'Use a prepared blank Products row, or export a fresh workbook for more space.'
        );
      const key = text(literal(row.getCell(28)));
      if (key && seenRows.has(key))
        throw new Error(
          'Duplicate row identity. Use a prepared blank row to create a selling option.'
        );
      if (key) seenRows.add(key);
      const pack = key.startsWith('p:') ? packById.get(key.slice(2)) : undefined;
      const variant = key.startsWith('v:')
        ? variants.get(key.slice(2))
        : pack
          ? variants.get(pack.variant_id)
          : undefined;
      if (key && !variant)
        throw new Error('Unknown saved row identity. Download a fresh workbook.');
      const product = variant ? products.get(variant.product_id) : undefined;
      const name = optional(literal(row.getCell(1)), 200, 'Product');
      if (!name) throw new Error('Product is required.');
      let maker: string | null = null;
      if (row.getCell(2).formula) {
        if (!sameFormula(row.getCell(2).formula, makerFormula(n, references + 5)))
          throw new Error('Manufacturer: unsupported formula. Select a name from the list.');
        maker = text(literal(row.getCell(29))) || null;
        if (maker && !makers.has(maker))
          throw new Error('Manufacturer reference is missing. Reselect it from the list.');
      } else {
        const label = text(literal(row.getCell(2))),
          ids = makerNames.get(normalized(label));
        if (label && ids?.length !== 1)
          throw new Error(
            'Manufacturer: select a unique name from Manufacturers. Reselect values used before a reference rename.'
          );
        maker = ids?.[0] ?? null;
      }
      if (maker && !makers.get(maker)!.active && maker !== product?.manufacturer_id)
        throw new Error('Manufacturer: choose an available manufacturer.');
      const size = variantName(text(literal(row.getCell(3))));
      let sold: string;
      if (row.getCell(4).formula) {
        if (!pack || !variant) throw new Error('Sold as: select a selling option.');
        const choice = choiceFor(variant, choices),
          sizeRef = sizes.get(text(literal(row.getCell(30))));
        if (
          !sizeRef ||
          !sameFormula(row.getCell(4).formula, soldFormula(n, references + 5, choice))
        )
          throw new Error('Sold as: restore the pack reference or select it again.');
        sold = packLabel(sizeRef, choice);
      } else sold = text(literal(row.getCell(4)));
      if (!sold) throw new Error('Sold as is required. Fill the Single / Per row first.');
      const entry: Entry = {
        row,
        key,
        product,
        variant,
        pack,
        name,
        maker,
        size,
        sold,
        choice: choices.find(c => c.label === sold),
      };
      if (variant && !pack && sold !== choiceFor(variant, choices).label)
        throw new Error('Sold as: change an existing stock unit in the product editor.');
      entries.push(entry);
      if (product && variant) {
        const parent = getProduct(product),
          owner = getVariant(variant);
        entry.parent = parent;
        entry.owner = owner;
        merge(entry, parent.key, parent.values, 'name', product.name, name, 'Product');
        merge(
          entry,
          parent.key,
          parent.values,
          'manufacturer_key',
          product.manufacturer_id,
          maker,
          'Manufacturer'
        );
        merge(
          entry,
          owner.key,
          owner.values,
          'name',
          variant.name,
          size || 'Default',
          'Size / type'
        );
      }
    });
  });
  const bases = entries.filter(e => !e.pack && (e.variant || e.choice));
  const owners = new Map<string, Entry>();
  const parentsByName = new Map<string, ProductEdit[]>();
  const parentKey = (name: string, maker: string | null) => familyKey(name, maker ?? '', '');
  for (const product of original.products) {
    const edit = getProduct(product),
      key = parentKey(edit.values.name, edit.values.manufacturer_key);
    const list = parentsByName.get(key) ?? [];
    list.push(edit);
    parentsByName.set(key, list);
  }
  for (const entry of bases)
    attempt('Products', entry.row.number, () => {
      let parent = entry.parent;
      if (!parent) {
        const matches = parentsByName.get(parentKey(entry.name, entry.maker)) ?? [];
        if (matches.length > 1)
          throw new Error(
            'Product: more than one product has this name and manufacturer. Give the intended parent a distinct name before adding children.'
          );
        parent = matches[0];
        if (!parent) {
          parent = {
            key: `new-product-${entry.row.number}`,
            id: null,
            expected_updated_at: null,
            values: {
              name: entry.name,
              manufacturer_key: entry.maker,
              barcode: null,
              active: true,
              tax_category_id: null,
            },
            variants: [],
          };
          productEdits.set(parent.key, parent);
          parentsByName.set(parentKey(entry.name, entry.maker), [parent]);
          line(
            entry,
            'Create product',
            null,
            `${entry.name}${entry.maker ? ' · ' + makers.get(entry.maker)!.name : ''}`
          );
        }
        entry.parent = parent;
      }
      if (!entry.owner) {
        if (
          original.variants.some(
            v =>
              v.product_id === parent!.id &&
              normalized(variantName(v.name)) === normalized(entry.size)
          )
        )
          throw new Error('Size / type already exists. Edit its exported Single / Per row.');
        const choice = entry.choice!;
        entry.owner = {
          key: `new-variant-${entry.row.number}`,
          id: null,
          expected_updated_at: null,
          values: {
            name: entry.size || 'Default',
            sku: '',
            barcode: null,
            kind: choice.kind,
            price: 0,
            wholesale_price: null,
            stock_unit: choice.unit,
            track_inventory: choice.kind === 'good',
            allow_fractional: choice.fractional,
            active: true,
          },
          packs: [],
          expected_packs: [],
        };
        variantEdits.set(entry.owner.key, entry.owner);
        line(
          entry,
          'Create size / type',
          null,
          `${parent.values.name} · ${entry.size || 'Default'} · ${entry.sold}`
        );
      }
      const owner = entry.owner;
      const identity = familyKey(parent.key, '', owner.values.name);
      if (owners.has(identity))
        throw new Error('Duplicate Single / Per row for this size / type. Keep one stock row.');
      owners.set(identity, entry);
      const applyField = <K extends keyof VariantEdit['values']>(
        field: K,
        value: VariantEdit['values'][K],
        label: string
      ) => {
        if (!entry.variant && field === 'price') {
          owner.values[field] = value;
          line(entry, label, null, value);
          return;
        }
        merge(
          entry,
          owner.key,
          owner.values,
          field,
          entry.variant ? variantValues(entry.variant)[field] : owner.values[field],
          value,
          label
        );
      };
      const retail = raw(entry, 6),
        wholesale = raw(entry, 8);
      if (!entry.variant && blank(retail))
        throw new Error('New retail is required for a new Single / Per row.');
      if (!blank(retail)) applyField('price', number(retail, 'New retail'), 'Retail');
      if (!blank(wholesale))
        applyField(
          'wholesale_price',
          text(wholesale).toUpperCase() === 'CLEAR' ? null : number(wholesale, 'New wholesale'),
          'Wholesale'
        );
      applyField('sku', optional(raw(entry, 13), 64, 'SKU') ?? '', 'SKU');
      if (entry.variant?.sku && !owner.values.sku)
        throw new Error('SKU cannot be cleared on an existing size / type.');
      applyField('barcode', optional(raw(entry, 14), 64, 'Barcode'), 'Barcode');
      const kind = normalized(text(raw(entry, 16)) || 'Good');
      if (!['good', 'service'].includes(kind))
        throw new Error('Item type: choose Good or Service.');
      applyField('kind', kind as 'good' | 'service', 'Item type');
      applyField(
        'track_inventory',
        bool(raw(entry, 17), owner.values.track_inventory, 'Track stock?'),
        'Track stock?'
      );
      applyField(
        'allow_fractional',
        bool(raw(entry, 18), owner.values.allow_fractional, 'Allow fractions?'),
        'Allow fractions?'
      );
      if (
        owner.values.kind === 'service' &&
        (owner.values.track_inventory || owner.values.allow_fractional)
      )
        throw new Error('Service rows cannot track stock or allow fractions.');
      applyField(
        'active',
        bool(raw(entry, 21), owner.values.active, 'Selling option active?'),
        'Selling option active?'
      );
      const tax = text(raw(entry, 19));
      const taxId =
        tax && tax !== 'Shop default' ? original.taxes.find(t => t.code === tax)?.id : null;
      if (taxId === undefined)
        throw new Error('Tax category: choose a configured category or Shop default.');
      const baselineProduct = parent.id
        ? productValues(products.get(parent.id)!)
        : { barcode: null, active: true, tax_category_id: null };
      // Blank/default product details on a new child inherit its parent's details.
      const productBarcode = optional(raw(entry, 15), 64, 'Product barcode');
      if (entry.variant || productBarcode !== null)
        merge(
          entry,
          parent.key,
          parent.values,
          'barcode',
          baselineProduct.barcode,
          productBarcode,
          'Product barcode'
        );
      const active = bool(raw(entry, 20), true, 'Product active?');
      if (entry.variant || !active)
        merge(
          entry,
          parent.key,
          parent.values,
          'active',
          baselineProduct.active,
          active,
          'Product active?'
        );
      if (entry.variant || taxId !== null)
        merge(
          entry,
          parent.key,
          parent.values,
          'tax_category_id',
          baselineProduct.tax_category_id,
          taxId,
          'Tax category'
        );
      const tracked = owner.values.kind === 'good' && owner.values.track_inventory;
      const counted = raw(entry, 12),
        buying = raw(entry, 10),
        exact = raw(entry, 27);
      if ((!tracked || !live.capabilities.stock) && !blank(counted))
        throw new Error(
          'Counted stock: this row cannot accept stock changes with your current permissions.'
        );
      if (
        (!tracked || !live.capabilities.financial || !live.capabilities.stock) &&
        (!blank(buying) || !blank(exact))
      )
        throw new Error(
          'Buying/value changes require stock and financial permissions on a tracked good.'
        );
      if (!blank(buying) && !blank(exact))
        throw new Error('Use New buying or Revised batch value, not both.');
      const count = blank(counted)
        ? undefined
        : number(counted, 'Counted stock', owner.values.allow_fractional);
      const cost = blank(buying) ? undefined : parseUnitCost(text(buying));
      if (cost === null)
        throw new Error('New buying: enter a nonnegative cost with at most 2 decimal places.');
      const exactValue = blank(exact) ? undefined : number(exact, 'Revised batch value KES');
      const oldStock = entry.variant ? stockByVariant.get(entry.variant.id) : undefined;
      const batch = oldStock?.batch;
      const batchInput = (column: 22 | 23, before: string | null) => {
        if (!tracked || !original.capabilities.financial) return before;
        const value = raw(entry, column);
        // Enabling tracking leaves the exported placeholders in these cells.
        return value === BLOCKED ? before : value;
      };
      const batchNumber = optional(
        batchInput(22, batch?.batch_number ?? null),
        120,
        'Batch number'
      );
      const expiry = date(batchInput(23, batch?.expiry_date ?? null));
      if (!entry.variant) {
        if ((count ?? 0) > 0 && cost === undefined)
          throw new Error('New buying is required with opening stock.');
        if (exactValue !== undefined)
          throw new Error(
            'Revised batch value applies to existing batches. Enter New buying for opening stock.'
          );
        if ((count ?? 0) === 0 && (cost !== undefined || batchNumber || expiry))
          throw new Error('Enter an opening Counted stock quantity with buying or batch details.');
        owner.opening_quantity = count ?? 0;
        owner.opening_unit_cost = cost;
        owner.batch_number = batchNumber;
        owner.expiry_date = expiry;
        if (count !== undefined)
          line(entry, `Opening stock (${owner.values.stock_unit})`, 0, count);
        if (cost !== undefined) line(entry, `Buying / ${owner.values.stock_unit}`, null, cost);
      } else {
        const oldQuantity = oldStock?.quantity ?? 0;
        const increase = Math.max(0, (count ?? oldQuantity) - oldQuantity);
        if (count !== undefined && count !== oldQuantity) {
          result.changes.stock.push({
            variant_id: entry.variant.id,
            stock_location_id: original.location.id,
            expected_stock_quantity: oldQuantity,
            new_stock_quantity: count,
          });
          line(entry, `Stock (${owner.values.stock_unit})`, oldQuantity, count);
        }
        const editedBatch =
          (cost !== undefined && cost !== batch?.unit_cost) ||
          (exactValue !== undefined && exactValue !== batch?.remaining_cost) ||
          batchNumber !== (batch?.batch_number ?? null) ||
          expiry !== (batch?.expiry_date ?? null);
        if (editedBatch || increase > 0) {
          if (!live.capabilities.financial || !live.capabilities.stock)
            throw new Error('Buying / batch changes require stock and financial permissions.');
          if (!batch && increase === 0)
            throw new Error(
              'There is no open batch. Enter an increased Counted stock quantity and New buying to receive stock.'
            );
          const nextCost = cost ?? batch?.unit_cost;
          if (nextCost === undefined || (nextCost <= 0 && (increase > 0 || batch?.unit_cost !== 0)))
            throw new Error(
              'New buying must be positive for added stock or a buying-price correction.'
            );
          result.changes.batches.push({
            action: batch ? 'update' : 'create',
            ...(batch ? { batch_id: batch.id } : {}),
            variant_id: entry.variant.id,
            stock_location_id: original.location.id,
            latest: true,
            expected_remaining: batch?.remaining ?? 0,
            expected_unit_cost: batch?.unit_cost ?? 0,
            expected_remaining_cost: batch?.remaining_cost ?? 0,
            expected_batch_number: batch?.batch_number ?? null,
            expected_expiry_date: batch?.expiry_date ?? null,
            new_unit_cost: nextCost,
            ...(exactValue === undefined ? {} : { new_remaining_cost: exactValue }),
            new_batch_number: batchNumber,
            new_expiry_date: expiry,
            quantity_added: increase,
          });
          line(entry, `Buying / ${owner.values.stock_unit}`, batch?.unit_cost ?? null, nextCost);
          if (exactValue !== undefined || (cost !== undefined && cost !== batch?.unit_cost))
            line(
              entry,
              'Remaining batch value KES',
              batch?.remaining_cost ?? 0,
              exactValue ?? Math.round((batch?.remaining ?? 0) * nextCost)
            );
          line(entry, 'Batch number', batch?.batch_number ?? null, batchNumber);
          line(entry, 'Expiry date', batch?.expiry_date ?? null, expiry);
        }
        const originalTracked = entry.variant.kind === 'good' && entry.variant.track_inventory;
        const current: Record<number, unknown> = {
          5: entry.variant.price,
          7: entry.variant.wholesale_price ?? '—',
          9:
            !originalTracked || !original.capabilities.financial
              ? BLOCKED
              : (batch?.unit_cost ?? '—'),
          11: originalTracked ? oldQuantity : BLOCKED,
          24:
            !originalTracked || !original.capabilities.financial ? BLOCKED : (oldStock?.value ?? 0),
          25:
            !originalTracked || !original.capabilities.financial
              ? BLOCKED
              : (batch?.remaining ?? '—'),
          26:
            !originalTracked || !original.capabilities.financial
              ? BLOCKED
              : (batch?.remaining_cost ?? '—'),
        };
        for (const [c, value] of Object.entries(current))
          if (literal(entry.row.getCell(Number(c))) !== value)
            throw new Error(
              `${HEADERS[Number(c) - 1]} is a reference. Enter changes in its New / Counted column.`
            );
      }
    });
  const basesByIdentity = new Map<string, Entry[]>();
  const baseByOwner = new Map<string, Entry>();
  for (const base of bases)
    if (base.owner && base.parent) {
      baseByOwner.set(base.owner.key, base);
      for (const key of [
        familyKey(
          base.parent.values.name,
          base.parent.values.manufacturer_key ?? '',
          base.owner.values.name
        ),
        `id:${base.owner.id}`,
      ]) {
        const list = basesByIdentity.get(key) ?? [];
        list.push(base);
        basesByIdentity.set(key, list);
      }
    }
  for (const entry of entries.filter(e => e.pack || (!e.variant && !e.choice)))
    attempt('Products', entry.row.number, () => {
      const matches =
        basesByIdentity.get(
          entry.variant
            ? `id:${entry.variant.id}`
            : familyKey(entry.name, entry.maker ?? '', entry.size)
        ) ?? [];
      if (matches.length !== 1)
        throw new Error(
          'Sold as: pack needs exactly one matching Single / Per row. Repeat Product, Manufacturer and Size / type.'
        );
      const base = matches[0],
        owner = base.owner!,
        parent = base.parent!;
      entry.owner = owner;
      entry.parent = parent;
      const choice = base.choice ?? choices.find(c => c.unit === owner.values.stock_unit)!;
      const matchesSize = [...sizes.values()].filter(
        size => packLabel(size, choice) === entry.sold
      );
      if (matchesSize.length !== 1)
        throw new Error('Sold as: choose a pack from Pack sizes for this Single / Per row.');
      const size = matchesSize[0];
      if (entry.pack && size.pieces !== entry.pack.units_per_pack)
        throw new Error('Pack contents are fixed. Add a new pack row for different contents.');
      for (const c of [8, 10, 12, 27])
        if (!blank(raw(entry, c)))
          throw new Error(
            `${HEADERS[c - 1]} belongs on the Single / Per row. Keep this pack cell as XXXX.`
          );
      for (const c of [13, 15, 16, 17, 18, 19, 20, 22, 23]) {
        const value = raw(entry, c);
        const preparedDefault =
          !entry.pack &&
          (([16, 17, 18].includes(c) && !!entry.row.getCell(c).formula) ||
            (c === 19 && value === 'Shop default') ||
            (c === 20 && value === 'Yes'));
        if (!blank(value) && !preparedDefault)
          throw new Error(`${HEADERS[c - 1]} belongs on the Single / Per row.`);
      }
      const retail = raw(entry, 6);
      const price = blank(retail)
        ? (entry.pack?.sale_price ?? null)
        : text(retail).toUpperCase() === 'CLEAR'
          ? null
          : number(retail, 'New retail');
      if (price === 0)
        throw new Error('New retail: pack price must be positive, or CLEAR for purchase only.');
      const updated = {
        id: entry.pack?.id ?? crypto.randomUUID(),
        name: size.name,
        units_per_pack: size.pieces,
        sale_price: price,
        barcode: optional(raw(entry, 14), 64, 'Barcode'),
        active: bool(raw(entry, 21), entry.pack?.active ?? true, 'Selling option active?'),
      };
      if (updated.active && owner.values.kind !== 'good')
        throw new Error(
          'Active packs require physical goods. Retire the packs before changing to a service.'
        );
      if (entry.pack) {
        if (literal(entry.row.getCell(5)) !== (entry.pack.sale_price ?? 'Purchase only'))
          throw new Error('Retail now is a reference. Enter New retail.');
        for (const c of [7, 9, 11, 24, 25, 26])
          if (literal(entry.row.getCell(c)) !== BLOCKED)
            throw new Error(`${HEADERS[c - 1]}: pack references must stay XXXX.`);
        owner.packs = owner.packs.map(p => (p.id === updated.id ? updated : p));
        line(entry, 'Pack name', entry.pack.name, updated.name);
        line(entry, 'Pack retail', entry.pack.sale_price, price);
        line(entry, 'Barcode', entry.pack.barcode, updated.barcode);
        line(entry, 'Selling option active?', entry.pack.active, updated.active);
      } else {
        owner.packs.push(updated);
        line(
          entry,
          'Create pack',
          null,
          `${entry.sold} · ${price === null ? 'Purchase only' : `${price} KES`}`
        );
      }
    });
  for (const edit of variantEdits.values()) {
    const base = baseByOwner.get(edit.key);
    if (!base) continue;
    const originalVariant = edit.id ? variants.get(edit.id) : undefined;
    const changed =
      !originalVariant ||
      !equal(edit.values, variantValues(originalVariant)) ||
      JSON.stringify(edit.packs) !== JSON.stringify(edit.expected_packs) ||
      result.changes.stock.some(s => s.variant_id === edit.id) ||
      result.changes.batches.some(b => b.variant_id === edit.id);
    if (changed) base.parent!.variants.push(edit);
    const names = new Set<string>();
    for (const pack of edit.packs)
      if (pack.active) {
        const name = normalized(pack.name);
        if (names.has(name))
          result.errors.push(
            `Products row ${base.row.number}: duplicate active pack name “${pack.name}”. Use distinct pack names for this size / type.`
          );
        names.add(name);
      }
  }
  result.changes.products = [...productEdits.values()].filter(
    p => !p.id || p.variants.length || !equal(p.values, productValues(products.get(p.id)!))
  );
  // A product-only edit still checks its parent; absent variants are deliberately omitted.
  for (const edit of result.changes.products) {
    if (edit.id) {
      const current = live.products.find(p => p.id === edit.id);
      if (!current || current.updated_at !== edit.expected_updated_at)
        result.conflicts.push(
          `${edit.values.name}: product changed after export. Download a fresh workbook.`
        );
    } else if (
      live.products.some(
        p =>
          normalized(p.name) === normalized(edit.values.name) &&
          p.manufacturer_id === edit.values.manufacturer_key
      )
    ) {
      result.conflicts.push(
        `${edit.values.name}: a matching product was created after export. Download a fresh workbook to edit it.`
      );
    }
    for (const variant of edit.variants)
      if (variant.id) {
        const current = live.variants.find(v => v.id === variant.id);
        if (
          !current ||
          current.product_id !== edit.id ||
          current.updated_at !== variant.expected_updated_at ||
          JSON.stringify(
            live.packs
              .filter(p => p.variant_id === variant.id)
              .map(plainPack)
              .sort((a, b) => a.id.localeCompare(b.id))
          ) !== JSON.stringify([...variant.expected_packs].sort((a, b) => a.id.localeCompare(b.id)))
        )
          result.conflicts.push(
            `${edit.values.name} · ${variant.values.name}: selling options changed after export.`
          );
      }
  }
  for (const edit of result.changes.manufacturers)
    if (
      edit.id &&
      live.manufacturers.find(m => m.id === edit.id)?.updated_at !== edit.expected_updated_at
    )
      result.conflicts.push(`${edit.name}: manufacturer changed after export.`);
  for (const edit of result.changes.stock)
    if (
      (live.stock.find(s => s.variant_id === edit.variant_id)?.quantity ?? 0) !==
      edit.expected_stock_quantity
    )
      result.conflicts.push('Stock changed after export. Download a fresh workbook and recount.');
  for (const edit of result.changes.batches) {
    const current = live.stock.find(s => s.variant_id === edit.variant_id)?.batch;
    if (
      edit.action === 'create'
        ? !!current
        : !current ||
          current.id !== edit.batch_id ||
          current.remaining !== edit.expected_remaining ||
          current.unit_cost !== edit.expected_unit_cost ||
          current.remaining_cost !== edit.expected_remaining_cost ||
          current.batch_number !== edit.expected_batch_number ||
          current.expiry_date !== edit.expected_expiry_date
    )
      result.conflicts.push('The latest batch changed after export. Download a fresh workbook.');
  }
  return result;
}
