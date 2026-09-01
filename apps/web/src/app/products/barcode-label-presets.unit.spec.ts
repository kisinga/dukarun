import { describe, expect, it } from 'vitest';
import {
  BARCODE_LABEL_PRESETS,
  barcodeLabelPageStyles,
  barcodeLabelPrintableWidth,
} from './barcode-label-presets';

describe('barcode label presets', () => {
  it('exposes only approved fixed sizes', () => {
    expect(BARCODE_LABEL_PRESETS.map(preset => preset.id)).toEqual([
      'a4-grid',
      'compact-roll',
      '58mm-roll',
      '80mm-roll',
    ]);
  });

  it('retains exact paper dimensions', () => {
    expect(barcodeLabelPageStyles('a4-grid')).toMatch(/size: A4 portrait/);
    expect(barcodeLabelPageStyles('a4-grid')).toMatch(/repeat\(3, 1fr\)/);
    expect(barcodeLabelPageStyles('compact-roll')).toMatch(/size: 50mm 30mm/);
    expect(barcodeLabelPageStyles('58mm-roll')).toMatch(/size: 58mm 30mm/);
    expect(barcodeLabelPageStyles('80mm-roll')).toMatch(/size: 80mm 40mm/);
  });

  it('keeps printable barcode width inside each label', () => {
    expect(barcodeLabelPrintableWidth('compact-roll')).toBeLessThan(50);
    expect(barcodeLabelPrintableWidth('58mm-roll')).toBeLessThan(58);
    expect(barcodeLabelPrintableWidth('58mm-roll')).toBeGreaterThan(50);
    expect(barcodeLabelPrintableWidth('80mm-roll')).toBeLessThan(80);
    expect(barcodeLabelPrintableWidth('80mm-roll')).toBeGreaterThan(58);
    expect(barcodeLabelPrintableWidth('a4-grid')).toBeLessThan(194 / 3);
  });
});
