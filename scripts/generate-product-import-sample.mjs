import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'docs/sample-product-import.xlsx');
const temp = mkdtempSync(join(tmpdir(), 'dukarun-product-import-'));

const xmlEscape = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const columnName = index => {
  let name = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
};

const excelDate = value =>
  Math.floor((Date.parse(`${value}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

function cell(ref, value, style = 0, type = 'string') {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
  if (type === 'number') return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  if (type === 'boolean') return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (type === 'date') return `<c r="${ref}" s="5"><v>${excelDate(value)}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function worksheet({ rows, widths, freeze = 'A2', autoFilter, validations = [], tabColor }) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((entry, columnIndex) => {
          const data =
            entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : { value: entry };
          return cell(
            `${columnName(columnIndex + 1)}${rowIndex + 1}`,
            data.value,
            data.style ?? 0,
            data.type ?? 'string'
          );
        })
        .join('');
      const height = rowIndex === 0 ? ' ht="30" customHeight="1"' : '';
      return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    })
    .join('');

  const validationXml = validations.length
    ? `<dataValidations count="${validations.length}">${validations
        .map(
          rule =>
            `<dataValidation type="list" allowBlank="${rule.allowBlank ? 1 : 0}" showErrorMessage="1" errorTitle="Invalid value" error="Choose a value from the list." sqref="${rule.range}"><formula1>${rule.name}</formula1></dataValidation>`
        )
        .join('')}</dataValidations>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><tabColor rgb="${tabColor ?? 'FF1F4E78'}"/></sheetPr>
  <dimension ref="A1:${columnName(widths.length)}${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="${freeze}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
  <sheetData>${rowXml}</sheetData>
  ${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ''}
  ${validationXml}
</worksheet>`;
}

function write(relativePath, contents) {
  const path = join(temp, relativePath);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, contents);
}

const headers = [
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
];

const headerRow = headers.map((value, index) => ({ value, style: index < 3 ? 2 : 1 }));
const productRows = [
  headerRow,
  [
    'NEW-001',
    '',
    '',
    'Unga Maize Meal',
    'Unga Limited',
    '',
    true,
    '1 kg',
    'UNGA-MAIZE-1KG',
    '6161100000012',
    'good',
    { value: 180, type: 'number', style: 3 },
    { value: 165, type: 'number', style: 3 },
    true,
    false,
    true,
    { value: 24, type: 'number', style: 4 },
    { value: 140, type: 'number', style: 3 },
    'MAIN',
    'OPEN-001',
    { value: '2027-06-30', type: 'date' },
  ],
  [
    'NEW-001',
    '',
    '',
    'Unga Maize Meal',
    'Unga Limited',
    '',
    true,
    '2 kg',
    'UNGA-MAIZE-2KG',
    '6161100000029',
    'good',
    { value: 345, type: 'number', style: 3 },
    { value: 320, type: 'number', style: 3 },
    true,
    false,
    true,
    { value: 12, type: 'number', style: 4 },
    { value: 275, type: 'number', style: 3 },
    'MAIN',
    'OPEN-002',
    { value: '2027-06-30', type: 'date' },
  ],
  [
    'NEW-002',
    '',
    '',
    'Local Delivery',
    '',
    '',
    true,
    '',
    'DELIVERY-LOCAL',
    '',
    'service',
    { value: 250, type: 'number', style: 3 },
    '',
    false,
    false,
    true,
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'EXISTING-001',
    { value: '11111111-1111-4111-8111-111111111111', style: 7 },
    { value: '22222222-2222-4222-8222-222222222222', style: 7 },
    'Brookside Fresh Milk',
    'Brookside',
    '',
    true,
    '500 ml',
    'MILK-BROOK-500',
    '6161100000036',
    'good',
    { value: 65, type: 'number', style: 3 },
    { value: 58, type: 'number', style: 3 },
    true,
    false,
    true,
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'EXISTING-001',
    { value: '11111111-1111-4111-8111-111111111111', style: 7 },
    { value: '33333333-3333-4333-8333-333333333333', style: 7 },
    'Brookside Fresh Milk',
    'Brookside',
    '',
    true,
    '1 litre',
    'MILK-BROOK-1L',
    '6161100000043',
    'good',
    { value: 120, type: 'number', style: 3 },
    { value: 108, type: 'number', style: 3 },
    true,
    false,
    true,
    '',
    '',
    '',
    '',
    '',
  ],
];

const instructions = [
  [{ value: 'DukaRun Product Import — Sample Workbook', style: 1 }],
  [
    { value: 'Purpose', style: 6 },
    {
      value:
        'Each Products row represents one sellable variant. Repeat product fields for every variant in the same family.',
      style: 6,
    },
  ],
  [
    { value: 'New products', style: 6 },
    {
      value:
        'Leave product_id and variant_id blank. Give every row in the family the same unique product_key, such as NEW-001.',
      style: 6,
    },
  ],
  [
    { value: 'Updating products', style: 6 },
    {
      value:
        'Use the IDs supplied by a DukaRun export. The UUIDs in this sample are illustrative and will not match a real catalog.',
      style: 6,
    },
  ],
  [
    { value: 'Prices', style: 6 },
    {
      value:
        'Enter prices in Kenyan shillings, for example 180 or 180.50. Do not include KES or commas.',
      style: 6,
    },
  ],
  [
    { value: 'Single variant', style: 6 },
    {
      value:
        'variant_name may be blank when a product has exactly one variant; DukaRun stores it as Default.',
      style: 6,
    },
  ],
  [
    { value: 'SKU', style: 6 },
    {
      value:
        'SKU may be blank for a new variant and will be generated. Supplied SKUs must be unique within the company.',
      style: 6,
    },
  ],
  [
    { value: 'Opening stock', style: 6 },
    {
      value:
        'Allowed only for new good variants. It requires opening unit cost and a valid stock location code.',
      style: 6,
    },
  ],
  [
    { value: 'Existing stock', style: 6 },
    {
      value:
        'Do not enter opening quantity for an existing variant. Use Stock Adjustments for changes to current stock.',
      style: 6,
    },
  ],
  [
    { value: 'Services', style: 6 },
    {
      value:
        'Services must have track_inventory=false, allow_fractional=false, and no opening stock.',
      style: 6,
    },
  ],
  [
    { value: 'Deleting rows', style: 6 },
    {
      value:
        'Removing an exported row does not delete a product or variant. Set the appropriate active column to false.',
      style: 6,
    },
  ],
  [
    { value: 'System columns', style: 6 },
    {
      value:
        'The first three gray columns are identity/grouping fields. Do not invent IDs for new products.',
      style: 6,
    },
  ],
  [
    { value: 'Dates', style: 6 },
    { value: 'Use YYYY-MM-DD for expiry dates.', style: 6 },
  ],
];

const references = [
  [
    { value: 'Boolean values', style: 1 },
    { value: 'Product kinds', style: 1 },
    { value: 'Stock location codes', style: 1 },
  ],
  ['true', 'good', 'MAIN'],
  ['false', 'service', 'SHOP-2'],
];

write(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
);

write(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
);

write(
  'xl/workbook.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Products" sheetId="1" r:id="rId1"/>
    <sheet name="Instructions" sheetId="2" r:id="rId2"/>
    <sheet name="Reference Data" sheetId="3" r:id="rId3"/>
  </sheets>
  <definedNames>
    <definedName name="BooleanOptions">'Reference Data'!$A$2:$A$3</definedName>
    <definedName name="ProductKinds">'Reference Data'!$B$2:$B$3</definedName>
    <definedName name="StockLocations">'Reference Data'!$C$2:$C$3</definedName>
  </definedNames>
  <calcPr calcId="191029"/>
</workbook>`
);

write(
  'xl/_rels/workbook.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
);

write(
  'xl/styles.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3"><numFmt numFmtId="164" formatCode="#\,##0.00"/><numFmt numFmtId="165" formatCode="0.000"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos Display"/></font>
    <font><color rgb="FF666666"/><sz val="10"/><name val="Aptos"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF666666"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
);

write(
  'xl/worksheets/sheet1.xml',
  worksheet({
    rows: productRows,
    widths: [15, 39, 39, 25, 20, 19, 15, 18, 22, 19, 12, 18, 21, 17, 18, 15, 18, 23, 21, 17, 14],
    autoFilter: `A1:U${productRows.length}`,
    validations: [
      { range: 'G2:G5001', name: 'BooleanOptions' },
      { range: 'K2:K5001', name: 'ProductKinds' },
      { range: 'N2:P5001', name: 'BooleanOptions' },
      { range: 'S2:S5001', name: 'StockLocations', allowBlank: true },
    ],
  })
);

write(
  'xl/worksheets/sheet2.xml',
  worksheet({
    rows: instructions,
    widths: [24, 105],
    autoFilter: undefined,
    tabColor: 'FF70AD47',
  })
);

write(
  'xl/worksheets/sheet3.xml',
  worksheet({
    rows: references,
    widths: [22, 22, 28],
    autoFilter: 'A1:C3',
    tabColor: 'FFFFC000',
  })
);

write(
  'docProps/core.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>DukaRun Product Import Sample</dc:title><dc:creator>DukaRun</dc:creator><dc:description>Sample product import and export workbook</dc:description>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-08-07T00:00:00Z</dcterms:created>
</cp:coreProperties>`
);

write(
  'docProps/app.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>DukaRun</Application><AppVersion>2.0</AppVersion></Properties>`
);

mkdirSync(resolve(output, '..'), { recursive: true });
try {
  execFileSync('zip', ['-q', '-X', '-r', output, '.'], { cwd: temp });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(output);
