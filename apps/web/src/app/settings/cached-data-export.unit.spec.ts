import { describe, expect, it } from 'vitest';
import { createExcelWorkbook } from '../shared/excel-workbook';
import { addExportSheet } from './cached-data-export.service';

describe('cached data Excel export', () => {
  it('creates a frozen, filterable worksheet with styled headers', async () => {
    const workbook = await createExcelWorkbook();
    const sheet = addExportSheet(workbook, 'Customers', ['name', 'balance_kes'], [['A, B', -25]]);

    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.autoFilter).toEqual({ from: 'A1', to: 'B2' });
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(sheet.getColumn(2).numFmt).toBe('#,##0');
  });

  it('keeps text-like formulas as text and numbers as numbers', async () => {
    const workbook = await createExcelWorkbook();
    const sheet = addExportSheet(
      workbook,
      'Customers',
      ['phone', 'note', 'balance_kes'],
      [['+254700000000', '=2+2', -25]]
    );

    expect(sheet.getCell('A2').value).toBe('+254700000000');
    expect(sheet.getCell('B2').value).toBe('=2+2');
    expect(sheet.getCell('C2').value).toBe(-25);
  });
});
