import type { Cell, CellValue, DataValidation, Workbook, Worksheet } from 'exceljs';
import { createExcelWorkbook } from '../shared/excel-workbook';
import {
  BLOCKED,
  EXTRA_ROWS,
  HEADERS,
  MAX_ROWS,
  START_ROW,
  WORKBOOK_FORMAT,
  choiceFor,
  packLabel,
  packSizes,
  unitChoices,
  variantName,
  type WorkbookSnapshot,
  type WorkbookVariant,
  type WorkbookPack,
  type UnitChoice,
} from './product-workbook';

const GREY = 'EEF2F3',
  YELLOW = 'FFF0BD',
  TEAL = '137C78';
export const quote = (text: string): string => `"${text.replaceAll('"', '""')}"`;
export const column = (n: number): string => {
  let result = '';
  for (; n; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
};
const fill = (color: string) => ({
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: color },
});
const formula = (cell: Cell, expression: string, result: string | number | boolean = '') => {
  cell.value = { formula: expression, result };
};
const range = (sheet: string, col: string, last: number) => `'${sheet}'!$${col}$6:$${col}$${last}`;
export function makerFormula(row: number, last: number): string {
  return `IFERROR(INDEX(${range('Manufacturers', 'A', last)},MATCH($AC${row},${range('Manufacturers', 'E', last)},0)),"")`;
}
export function soldFormula(row: number, last: number, choice: UnitChoice): string {
  return `IFERROR(INDEX(${range('Pack sizes', 'A', last)},MATCH($AD${row},${range('Pack sizes', 'E', last)},0))&" of "&INDEX(${range('Pack sizes', 'B', last)},MATCH($AD${row},${range('Pack sizes', 'E', last)},0))&${quote(' ' + choice.plural)},"")`;
}
export function inputAllowed(n: number, c: number, snapshot: WorkbookSnapshot): string {
  const financial = c === 10 || c === 27;
  return c === 8
    ? `AH${n}=1`
    : `AND(AH${n}=1,P${n}<>"Service",Q${n}<>"No",${snapshot.capabilities.stock && (!financial || snapshot.capabilities.financial) ? 'TRUE()' : 'FALSE()'})`;
}
export const inputFormula = (n: number, c: number, snapshot: WorkbookSnapshot): string =>
  `IF(A${n}="","",IF(${inputAllowed(n, c, snapshot)},"","XXXX"))`;
export function dropdown(cell: Cell, list: string): void {
  cell.dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [list],
    showErrorMessage: true,
    errorStyle: 'stop',
    error: 'Choose from the list. Add manufacturers and pack sizes on their reference sheets.',
  };
}
// ExcelJS supports range validation at runtime, but omits it from Worksheet's types.
// Relative references are based on the range's first cell, as they are in Excel.
function validateRange(sheet: Worksheet, ref: string, rule: DataValidation): void {
  (
    sheet as Worksheet & {
      dataValidations: { add(address: string, validation: DataValidation): void };
    }
  ).dataValidations.add(ref, rule);
}
function readonly(cell: Cell): void {
  cell.fill = fill(GREY);
  cell.dataValidation = {
    type: 'custom',
    allowBlank: false,
    formulae: ['FALSE()'],
    showErrorMessage: true,
    errorStyle: 'stop',
    error: 'Reference only. Enter changes in the adjacent New or Counted column.',
  };
}
function table(
  sheet: Worksheet,
  name: string,
  headers: readonly string[],
  rows: CellValue[][]
): void {
  sheet.addTable({
    name,
    ref: 'A5',
    headerRow: true,
    columns: headers.map(name => ({ name, filterButton: true })),
    rows,
    style: { theme: 'TableStyleMedium2', showRowStripes: false },
  });
  sheet.getRow(5).height = 38;
  sheet.getRow(5).eachCell(cell => {
    cell.fill = fill(TEAL);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
}
function sheet(
  book: Workbook,
  name: string,
  widths: number[],
  subtitle: string,
  instructions: string
): Worksheet {
  const ws = book.addWorksheet(name, {
    views: [
      {
        state: 'frozen',
        xSplit: name === 'Products' ? 4 : 0,
        ySplit: 5,
        showGridLines: false,
        zoomScale: name === 'Products' ? 80 : 100,
      },
    ],
    properties: { defaultRowHeight: 30 },
  });
  ws.columns = widths.map(width => ({ width }));
  for (const [row, text] of [
    [1, name],
    [2, subtitle],
    [3, instructions],
  ] as const) {
    ws.mergeCells(row, 1, row, widths.length);
    ws.getCell(row, 1).value = text;
    ws.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' };
  }
  ws.getRow(1).height = 40;
  ws.getCell('A1').font = { name: 'Calibri', size: 23, bold: true, color: { argb: 'FFFFFF' } };
  ws.getCell('A1').fill = fill('183A43');
  ws.getRow(2).height = 28;
  ws.getRow(3).height = 65;
  return ws;
}

/** Every baseline record has its own cell: large catalogues never exceed Excel's cell text limit. */
export function writeBaseline(
  book: Workbook,
  snapshot: WorkbookSnapshot,
  capacity: number,
  references: number
): void {
  const ws = book.addWorksheet('_Original', { state: 'veryHidden' });
  const { products, variants, packs, manufacturers, taxes, stock, ...scope } = snapshot;
  ws.addRow(['format', WORKBOOK_FORMAT]);
  ws.addRow(['scope', JSON.stringify({ ...scope, capacity, references })]);
  for (const [kind, records] of Object.entries({
    products,
    variants,
    packs,
    manufacturers,
    taxes,
    stock,
  }))
    for (const record of records) ws.addRow([kind, JSON.stringify(record)]);
}

export async function exportProductWorkbook(
  snapshot: WorkbookSnapshot,
  extraRows = EXTRA_ROWS
): Promise<Workbook> {
  const populated = snapshot.variants.length + snapshot.packs.length;
  if (populated > MAX_ROWS)
    throw new Error(
      `Products workbooks support ${MAX_ROWS.toLocaleString()} selling-option rows, including packs. Export a smaller catalogue.`
    );
  const capacity = Math.min(MAX_ROWS, populated + extraRows);
  const sizes = packSizes(snapshot),
    choices = unitChoices(snapshot);
  const references = Math.max(sizes.length, snapshot.manufacturers.length) + EXTRA_ROWS;
  const last = capacity + 5,
    refLast = references + 5;
  const book = await createExcelWorkbook();
  book.creator = 'DukaRun';
  book.calcProperties.fullCalcOnLoad = true;
  const main = sheet(
    book,
    'Products',
    [24, 24, 19, 30, 12, 12, 13, 13, 22, 22, 17, 17],
    `${snapshot.company_name} · ${snapshot.location.code} — ${snapshot.location.name} · KES · ${snapshot.exported_at.slice(0, 10)}`,
    `FILL FIRST: Single / Per row → pack definition on Pack sizes → pack row with the same Product, Manufacturer and Size / type.\nRecommended layout: Single / Per followed by its packs. Matching searches the whole table; row position does not select a parent.\nBUYING PRICE = cost of ONE stock unit (piece, metre, pair, etc.). Divide the pack cost by its contents: KES 250 / 100 pieces = KES 2.50 per piece.\nYellow = changes · Grey / XXXX = reference · Blank New / Counted cells keep values · ${capacity - populated} prepared new rows · Sort using table headers.`
  );
  for (const [a, b, label] of [
    [1, 4, 'WHICH PRODUCT · HOW IT IS SOLD'],
    [5, 6, 'RETAIL · PER SOLD AS'],
    [7, 8, 'WHOLESALE'],
    [9, 10, 'BUYING · PER ONE STOCK UNIT'],
    [11, 12, 'STOCK · COUNT ONCE'],
  ] as const) {
    main.mergeCells(4, a, 4, b);
    main.getCell(4, a).value = label;
    main.getCell(4, a).fill = fill(GREY);
    main.getCell(4, a).font = { size: 10, bold: true };
  }
  const makers = sheet(
    book,
    'Manufacturers',
    [30, 16, 30],
    'Names selected on Products.',
    'Add a name below. Rename here to update linked products. A rename affects this manufacturer throughout your shop. At export shows the previous name.'
  );
  const packs = sheet(
    book,
    'Pack sizes',
    [29, 20, 33],
    'Reusable choices. Prices and stock are on Products.',
    'Add a pack name and the number of individual units. Then add its Products row. Existing contents are fixed; add a new definition for a different count.'
  );
  writeBaseline(book, snapshot, capacity, references);
  const lists = book.addWorksheet('_Choices', { state: 'veryHidden' });
  lists.addRow([
    'Sold as',
    'Unit',
    'Factor',
    'Mode',
    'Kind',
    'Fractions',
    'Single choices',
    'Tax choices',
  ]);
  choices.forEach((choice, i) => {
    lists.getCell(i + 2, 7).value = choice.label;
  });
  ['Shop default', ...snapshot.taxes.map(t => t.code)].forEach((value, i) => {
    lists.getCell(i + 2, 8).value = value;
  });
  book.definedNames.add(`'_Choices'!$G$2:$G$${choices.length + 1}`, 'SingleChoices');
  book.definedNames.add(`'_Choices'!$H$2:$H$${snapshot.taxes.length + 2}`, 'TaxChoices');
  let choiceRow = 2;
  for (const choice of choices) {
    const first = choiceRow;
    lists.getRow(choiceRow++).values = [
      choice.label,
      choice.unit,
      1,
      choice.key,
      choice.kind,
      choice.fractional,
    ];
    // Unit, factor and mode stay in a single bounded block per unit, not a copy per product.
    if (choice.kind === 'good') {
      for (let i = 0; i < references; i++) {
        const n = START_ROW + i,
          r = choiceRow++,
          size = sizes[i];
        formula(
          lists.getCell(r, 1),
          `IF(AND('Pack sizes'!A${n}<>"",ISNUMBER('Pack sizes'!B${n}),'Pack sizes'!B${n}>1,MOD('Pack sizes'!B${n},1)=0),'Pack sizes'!A${n}&" of "&'Pack sizes'!B${n}&${quote(' ' + choice.plural)},"")`,
          size ? packLabel(size, choice) : ''
        );
        lists.getCell(r, 2).value = choice.unit;
        formula(lists.getCell(r, 3), `IF(A${r}="","",'Pack sizes'!B${n})`, size?.pieces ?? '');
        lists.getCell(r, 4).value = choice.key;
        lists.getCell(r, 5).value = choice.kind;
        lists.getCell(r, 6).value = choice.fractional;
      }
    }
    book.definedNames.add(`'_Choices'!$A$${first}:$A$${choiceRow - 1}`, `Choices_${choice.key}`);
  }
  // Writing Row.values clears other columns, so populate the independent lists last.
  choices.forEach((choice, i) => {
    lists.getCell(i + 2, 7).value = choice.label;
  });
  ['Shop default', ...snapshot.taxes.map(t => t.code)].forEach((value, i) => {
    lists.getCell(i + 2, 8).value = value;
  });
  const choiceRange = `'_Choices'!$A$2:$F$${choiceRow - 1}`;
  table(
    makers,
    'ManufacturersTable',
    ['Manufacturer name', 'Available?', 'At export', '_choice', '_reference_id'],
    Array.from({ length: references }, (_, i) => {
      const maker = snapshot.manufacturers[i];
      return [
        maker?.name ?? null,
        maker ? (maker.active ? 'Yes' : 'No') : null,
        maker?.name ?? null,
        null,
        maker?.id ?? `new-maker-${i + 6}`,
      ];
    })
  );
  table(
    packs,
    'PackSizesTable',
    ['Pack name', 'Items in this pack', 'At export', '_reserved', '_reference_id'],
    Array.from({ length: references }, (_, i) => {
      const size = sizes[i];
      return [
        size?.name ?? null,
        size?.pieces ?? null,
        size ? `${size.name} · ${size.pieces}` : null,
        null,
        size?.id ?? `new-size-${i + 6}`,
      ];
    })
  );
  for (let i = 0; i < references; i++) {
    const n = i + 6;
    formula(
      makers.getCell(n, 4),
      `IF(OR(A${n}="",B${n}="No"),"",A${n})`,
      snapshot.manufacturers[i]?.active ? snapshot.manufacturers[i].name : ''
    );
    dropdown(makers.getCell(n, 2), '"Yes,No"');
    for (const ws of [makers, packs]) {
      ws.getCell(n, 1).fill = fill(YELLOW);
      ws.getCell(n, 2).fill = fill(YELLOW);
      readonly(ws.getCell(n, 3));
    }
    packs.getCell(n, 2).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [2, 99999999999],
      showErrorMessage: true,
      errorStyle: 'stop',
      error: 'Enter a whole number greater than one.',
    };
    if (sizes[i]) readonly(packs.getCell(n, 2));
  }
  for (const ws of [makers, packs]) {
    ws.getColumn(4).hidden = true;
    ws.getColumn(5).hidden = true;
  }
  book.definedNames.add(range('Manufacturers', 'D', refLast), 'ManufacturerChoices');
  const productById = new Map(snapshot.products.map(p => [p.id, p]));
  const makerById = new Map(snapshot.manufacturers.map(m => [m.id, m]));
  const stockById = new Map(snapshot.stock.map(s => [s.variant_id, s]));
  const ordered: { variant: WorkbookVariant; pack?: WorkbookPack }[] = [];
  const packsByVariant = new Map<string, WorkbookPack[]>();
  for (const pack of snapshot.packs)
    packsByVariant.set(pack.variant_id, [...(packsByVariant.get(pack.variant_id) ?? []), pack]);
  for (const variant of [...snapshot.variants].sort(
    (a, b) =>
      productById.get(a.product_id)!.name.localeCompare(productById.get(b.product_id)!.name) ||
      a.product_id.localeCompare(b.product_id) ||
      a.name.localeCompare(b.name)
  )) {
    ordered.push({ variant });
    for (const pack of packsByVariant.get(variant.id) ?? []) ordered.push({ variant, pack });
  }
  table(
    main,
    'ProductsTable',
    HEADERS,
    Array.from({ length: capacity }, () => Array<CellValue>(HEADERS.length).fill(null))
  );
  for (let i = 0; i < capacity; i++) {
    const n = START_ROW + i,
      entry = ordered[i],
      variant = entry?.variant,
      pack = entry?.pack;
    const product = variant ? productById.get(variant.product_id)! : undefined;
    const choice = variant ? choiceFor(variant, choices) : undefined;
    const stock = variant ? stockById.get(variant.id) : undefined;
    const size = pack
      ? sizes.find(s => s.name === pack.name && s.pieces === pack.units_per_pack)!
      : undefined;
    const tracked = variant ? variant.kind === 'good' && variant.track_inventory : true;
    const values: CellValue[] = [
      product?.name ?? null,
      product?.manufacturer_id ? (makerById.get(product.manufacturer_id)?.name ?? '') : null,
      variant ? variantName(variant.name) : null,
      choice ? (size ? packLabel(size, choice) : choice.label) : null,
      variant ? (pack ? (pack.sale_price ?? 'Purchase only') : variant.price) : 'New',
      null,
      pack ? BLOCKED : (variant?.wholesale_price ?? '—'),
      null,
      pack || !tracked || !snapshot.capabilities.financial
        ? BLOCKED
        : (stock?.batch?.unit_cost ?? '—'),
      null,
      pack || !tracked ? BLOCKED : (stock?.quantity ?? 0),
      null,
      pack ? BLOCKED : (variant?.sku ?? null),
      pack ? pack.barcode : (variant?.barcode ?? null),
      pack ? BLOCKED : (product?.barcode ?? null),
      pack ? BLOCKED : variant ? (variant.kind === 'service' ? 'Service' : 'Good') : null,
      pack ? BLOCKED : variant ? (tracked ? 'Yes' : 'No') : null,
      pack ? BLOCKED : variant ? (variant.allow_fractional ? 'Yes' : 'No') : null,
      pack
        ? BLOCKED
        : product?.tax_category_id
          ? (snapshot.taxes.find(t => t.id === product.tax_category_id)?.code ?? '')
          : 'Shop default',
      pack ? BLOCKED : product?.active === false ? 'No' : 'Yes',
      (pack?.active ?? variant?.active) === false ? 'No' : 'Yes',
      pack || !tracked || !snapshot.capabilities.financial
        ? BLOCKED
        : (stock?.batch?.batch_number ?? null),
      pack || !tracked || !snapshot.capabilities.financial
        ? BLOCKED
        : (stock?.batch?.expiry_date ?? null),
      pack || !tracked || !snapshot.capabilities.financial ? BLOCKED : (stock?.value ?? 0),
      pack || !tracked || !snapshot.capabilities.financial
        ? BLOCKED
        : (stock?.batch?.remaining ?? '—'),
      pack || !tracked || !snapshot.capabilities.financial
        ? BLOCKED
        : (stock?.batch?.remaining_cost ?? '—'),
      null,
      pack ? `p:${pack.id}` : variant ? `v:${variant.id}` : null,
      product?.manufacturer_id ?? null,
      size?.id ?? null,
    ];
    values.forEach((value, j) => {
      main.getCell(n, j + 1).value = value;
    });
    for (let c = 1; c <= 27; c++) {
      const cell = main.getCell(n, c);
      cell.font = { name: 'Calibri', size: 11, color: { argb: '243D45' } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
      cell.fill = fill([6, 8, 10, 12, 27].includes(c) || !variant ? YELLOW : 'FFFFFF');
      if ([5, 7, 9, 11, 24, 25, 26].includes(c) || cell.value === BLOCKED) readonly(cell);
      if ((c >= 5 && c <= 12) || c >= 24) cell.numFmt = '#,##0.###;[Red](#,##0.###);0;@';
      if (c === 9 || c === 10) cell.numFmt = '#,##0.##;[Red](#,##0.##);0;@';
      if (variant && ![5, 7, 9, 11, 24, 25, 26].includes(c))
        cell.note = `At export: ${cell.text || '(blank)'}. Optional details are edited here; blank clears an optional detail.`;
    }
    dropdown(main.getCell(n, 2), 'ManufacturerChoices');
    if (product?.manufacturer_id)
      formula(
        main.getCell(n, 2),
        makerFormula(n, refLast),
        makerById.get(product.manufacturer_id)?.name ?? ''
      );
    if (size && choice)
      formula(main.getCell(n, 4), soldFormula(n, refLast, choice), packLabel(size, choice));
    if (variant && !pack) readonly(main.getCell(n, 4));
    else if (variant || i === populated) {
      // Resolve the parent when the dropdown is used, avoiding 10,000 formulas
      // that each continuously depend on the whole Products table.
      dropdown(
        main.getCell(n, 4),
        `INDIRECT(IFERROR("Choices_"&INDEX($AI$6:$AI$${last},MATCH($AE${n},$AF$6:$AF$${last},0)),"SingleChoices"))`
      );
      if (!variant) validateRange(main, `D${n}:D${last}`, main.getCell(n, 4).dataValidation);
    }
    formula(
      main.getCell(n, 31),
      `IF(A${n}="","",LOWER(LEN(TRIM(A${n}))&":"&TRIM(A${n})&LEN(TRIM(B${n}))&":"&TRIM(B${n})&LEN(TRIM(C${n}))&":"&TRIM(C${n})))`
    );
    formula(main.getCell(n, 32), `IF(AND(A${n}<>"",COUNTIF(SingleChoices,D${n})=1),AE${n},"")`);
    for (const [c, lookup] of [
      [33, 2],
      [34, 3],
      [35, 4],
    ] as const)
      formula(
        main.getCell(n, c),
        `IF(D${n}="","",IFERROR(VLOOKUP(D${n},${choiceRange},${lookup},FALSE()),""))`,
        c === 33
          ? (choice?.unit ?? '')
          : c === 34
            ? (size?.pieces ?? (variant ? 1 : ''))
            : (choice?.key ?? '')
      );
    if (!variant) {
      formula(main.getCell(n, 5), `IF(A${n}="","","New")`);
      formula(
        main.getCell(n, 16),
        `IF(A${n}="","",IFERROR(IF(VLOOKUP(D${n},${choiceRange},5,FALSE())="service","Service","Good"),"Good"))`
      );
      formula(main.getCell(n, 17), `IF(A${n}="","",IF(P${n}="Service","No","Yes"))`);
      formula(
        main.getCell(n, 18),
        `IF(A${n}="","",IFERROR(IF(VLOOKUP(D${n},${choiceRange},6,FALSE()),"Yes","No"),"No"))`
      );
      formula(main.getCell(n, 7), `IF(A${n}="","",IF(AH${n}>1,"XXXX","—"))`);
      for (const c of [9, 11, 24, 25, 26])
        formula(
          main.getCell(n, c),
          `IF(A${n}="","",IF(OR(AH${n}>1,P${n}="Service",Q${n}="No"),"XXXX",${c === 11 || c === 24 ? '0' : '"—"'}))`
        );
    }
    for (const c of [8, 10, 12, 27]) {
      const financial = c === 10 || c === 27;
      const allowed = inputAllowed(n, c, snapshot);
      formula(
        main.getCell(n, c),
        inputFormula(n, c, snapshot),
        !variant
          ? ''
          : pack ||
              (c !== 8 &&
                (!tracked ||
                  !snapshot.capabilities.stock ||
                  (financial && !snapshot.capabilities.financial)))
            ? BLOCKED
            : ''
      );
      const address = `${column(c)}${n}`;
      const numeric = `AND(ISNUMBER(${address}),${address}>=0,${c === 12 ? `IF(R${n}="Yes",ROUND(${address},3)=${address},MOD(${address},1)=0)` : c === 10 ? `ROUND(${address},2)=${address}` : `MOD(${address},1)=0`})`;
      if (n === START_ROW)
        validateRange(main, `${column(c)}${n}:${column(c)}${last}`, {
          type: 'custom',
          allowBlank: true,
          formulae: [
            `OR(${address}="",${address}="XXXX",AND(${allowed},${c === 8 ? `OR(${address}="CLEAR",${numeric})` : numeric}))`,
          ],
          showErrorMessage: true,
          errorStyle: 'stop',
          ...(c === 10
            ? {
                showInputMessage: true,
                promptTitle: 'Buying price per stock unit',
                prompt:
                  'Enter the cost of ONE piece, metre, pair, etc., with up to 2 decimal places. Divide pack cost by its contents: KES 250 / 100 pieces = KES 2.50 per piece. Do not enter the whole pack cost.',
              }
            : {}),
          error:
            c === 10
              ? 'Enter KES per ONE stock unit, with up to 2 decimal places, on the Single / Per row. Divide pack cost by its contents first.'
              : 'Enter a valid amount on the Single / Per row. Pack stock is counted on its parent.',
        });
    }
    if (n === START_ROW)
      validateRange(main, `F${n}:F${last}`, {
        type: 'custom',
        allowBlank: true,
        formulae: [
          `OR(F${n}="",AND(AH${n}>1,F${n}="CLEAR"),AND(ISNUMBER(F${n}),MOD(F${n},1)=0,IF(AH${n}>1,F${n}>0,F${n}>=0)))`,
        ],
        showErrorMessage: true,
        errorStyle: 'stop',
        error: 'Enter whole KES. Packs need a positive price, or CLEAR for purchase only.',
      });
    for (const c of [17, 18, 20, 21]) if (!pack) dropdown(main.getCell(n, c), '"Yes,No"');
    if (!pack) {
      dropdown(main.getCell(n, 16), '"Good,Service"');
      dropdown(main.getCell(n, 19), 'TaxChoices');
    }
    if (choice) {
      for (const c of [7, 8])
        main.getCell(n, c).numFmt =
          `#,##0" / ${choice.unit.replaceAll('"', '')}";[Red](#,##0);0" / ${choice.unit.replaceAll('"', '')}";@`;
      for (const c of [9, 10])
        main.getCell(n, c).numFmt =
          `#,##0.##" / ${choice.unit.replaceAll('"', '')}";[Red](#,##0.##);0" / ${choice.unit.replaceAll('"', '')}";@`;
      for (const c of [11, 12])
        main.getCell(n, c).numFmt =
          `#,##0.###" ${choice.plural.replaceAll('"', '')}";[Red](#,##0.###);0" ${choice.plural.replaceAll('"', '')}";@`;
    }
  }
  // Conditional formats cover ranges, so pack restrictions also follow newly selected choices.
  for (const c of [8, 10, 12, 27])
    main.addConditionalFormatting({
      ref: `${column(c)}6:${column(c)}${last}`,
      rules: [
        {
          type: 'expression',
          priority: c,
          formulae: [c === 8 ? '$AH6>1' : 'OR($AH6>1,$P6="Service",$Q6="No")'],
          style: { fill: fill(GREY) },
        },
      ],
    });
  for (const choice of choices) {
    for (const [ref, format] of [
      [`K6:L${last}`, `#,##0.###" ${choice.plural.replaceAll('"', '')}"`],
      [`G6:H${last}`, `#,##0" / ${choice.unit.replaceAll('"', '')}"`],
      [`I6:J${last}`, `#,##0.##" / ${choice.unit.replaceAll('"', '')}"`],
    ] as const)
      main.addConditionalFormatting({
        ref,
        rules: [
          {
            type: 'expression',
            priority: 100 + choices.indexOf(choice),
            formulae: [`$AI6=${quote(choice.key)}`],
            style: { numFmt: format },
          },
        ],
      });
  }
  for (let c = 13; c <= 27; c++) {
    main.getColumn(c).width = 22;
    main.getColumn(c).outlineLevel = 1;
    main.getColumn(c).hidden = true;
  }
  for (let c = 28; c <= HEADERS.length; c++) main.getColumn(c).hidden = true;
  return book;
}
