export type BarcodeLabelLayout = 'a4-grid' | 'compact-roll' | '58mm-roll' | '80mm-roll';

export const BARCODE_LABEL_PRESETS: ReadonlyArray<{
  id: BarcodeLabelLayout;
  label: string;
}> = [
  { id: 'a4-grid', label: 'A4 grid — 3 × 7' },
  { id: 'compact-roll', label: 'Compact roll — 50 × 30 mm' },
  { id: '58mm-roll', label: '58 mm roll — 58 × 30 mm' },
  { id: '80mm-roll', label: '80 mm roll — 80 × 40 mm' },
];

/**
 * Usable barcode width per layout in mm (label width minus horizontal padding).
 * Used to size bars on whole printer dots so thermal rasterisation stays crisp.
 */
export function barcodeLabelPrintableWidth(layout: BarcodeLabelLayout): number {
  switch (layout) {
    case '80mm-roll':
      return 74; // 80 − 2 × 3
    case '58mm-roll':
      return 52; // 58 − 2 × 3
    case 'compact-roll':
      return 44; // 50 − 2 × 3
    default:
      return 56; // 194 / 3 − 2 × 4
  }
}

export function barcodeLabelPageStyles(layout: BarcodeLabelLayout): string {
  if (layout === '80mm-roll') {
    return `
      @page { size: 80mm 40mm; margin: 0; }
      .label-sheet { width: 80mm; }
      .barcode-label { width: 80mm; height: 40mm; padding: 2mm 3mm; page-break-after: always; }
      .barcode-label:last-child { page-break-after: auto; }
    `;
  }
  if (layout === '58mm-roll') {
    return `
      @page { size: 58mm 30mm; margin: 0; }
      .label-sheet { width: 58mm; }
      .barcode-label { width: 58mm; height: 30mm; padding: 2mm 3mm; page-break-after: always; }
      .barcode-label:last-child { page-break-after: auto; }
    `;
  }
  if (layout === 'compact-roll') {
    return `
      @page { size: 50mm 30mm; margin: 0; }
      .label-sheet { width: 50mm; }
      .barcode-label { width: 50mm; height: 30mm; padding: 2mm 3mm; page-break-after: always; }
      .barcode-label:last-child { page-break-after: auto; }
    `;
  }
  return `
    @page { size: A4 portrait; margin: 8mm; }
    .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); width: 194mm; }
    .barcode-label { height: 39.9mm; padding: 3mm 4mm; border: .2mm solid #ddd; }
  `;
}
