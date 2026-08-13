import { describe, expect, it } from 'vitest';
import { BARCODE_LABEL_PRESETS, barcodeLabelPageStyles } from './barcode-label-presets';

describe('barcode label presets', () => {
  it('exposes only approved fixed sizes', () => {
    expect(BARCODE_LABEL_PRESETS.map(preset => preset.id)).toEqual(['a4-grid', 'compact-roll']);
  });

  it('retains exact paper dimensions', () => {
    expect(barcodeLabelPageStyles('a4-grid')).toMatch(/size: A4 portrait/);
    expect(barcodeLabelPageStyles('a4-grid')).toMatch(/repeat\(3, 1fr\)/);
    expect(barcodeLabelPageStyles('compact-roll')).toMatch(/size: 50mm 30mm/);
  });
});
