import type { Workbook } from 'exceljs';

type WorkbookConstructor = new () => Workbook;

/** Normalize ExcelJS's CommonJS namespace across Node, tests, and browser bundlers. */
export async function createExcelWorkbook(): Promise<Workbook> {
  const loaded = (await import('exceljs')) as unknown as {
    Workbook?: WorkbookConstructor;
    default?: { Workbook?: WorkbookConstructor };
  };
  const WorkbookClass = loaded.Workbook ?? loaded.default?.Workbook;
  if (!WorkbookClass) throw new Error('Excel workbook support could not be loaded.');
  return new WorkbookClass();
}
