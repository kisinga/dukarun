export type BarcodeLabelLayout = 'a4-grid' | 'compact-roll';

export const BARCODE_LABEL_PRESETS: ReadonlyArray<{
  id: BarcodeLabelLayout;
  label: string;
}> = [
  { id: 'a4-grid', label: 'A4 grid — 3 × 7' },
  { id: 'compact-roll', label: 'Compact roll — 50 × 30 mm' },
];

export function barcodeLabelPageStyles(layout: BarcodeLabelLayout): string {
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
