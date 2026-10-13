import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportProductWorkbook } from './product-workbook-export';
import { workbookFixture } from './product-workbook.fixture';

describe('Products workbook Excel compatibility', () => {
  it('serializes font and fill colors as four-byte ARGB values', async () => {
    const book = await exportProductWorkbook(workbookFixture());
    const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
    const styles = await zip.file('xl/styles.xml')!.async('string');
    // SpreadsheetML ST_UnsignedIntHex requires four bytes, including alpha.
    const colors = [...styles.matchAll(/\brgb="([^"]+)"/g)].map(match => match[1]);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter(color => !/^[\dA-F]{8}$/i.test(color))).toEqual([]);
  });

  it('exports tables without the legacy note drawings ExcelJS writes out of order', async () => {
    const book = await exportProductWorkbook(workbookFixture());
    const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
    const main = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(main).toContain('<tableParts');
    // ExcelJS 4.4 emits legacyDrawing after tableParts, contrary to CT_Worksheet.
    // The hidden baseline already retains original values without cell notes.
    expect(main.includes('<legacyDrawing')).toBe(false);
    expect(Object.keys(zip.files).filter(name => /comments|\.vml$/i.test(name))).toEqual([]);
    expect(book.getWorksheet('_Original')!.rowCount).toBeGreaterThan(2);
  });

  it('gives every conditional formatting rule a distinct positive priority', async () => {
    const book = await exportProductWorkbook(workbookFixture());
    const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer());
    const main = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const priorities = [...main.matchAll(/<cfRule\b[^>]*\bpriority="([^"]+)"/g)].map(match =>
      Number(match[1])
    );
    expect(priorities.length).toBeGreaterThan(4);
    expect(priorities.every(priority => Number.isInteger(priority) && priority > 0)).toBe(true);
    expect(new Set(priorities).size).toBe(priorities.length);
  });
});
