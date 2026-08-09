import type { Variant } from '../pos/pos.service';

export const BARCODE_MAX_LENGTH = 64;
export const LABEL_BATCH_SIZE = 500;

export type BarcodeLabelState = 'ready' | 'missing' | 'ambiguous';

export interface ClassifiedBarcodeLabel {
  variant: Variant;
  state: BarcodeLabelState;
}

export function generateDukarunBarcode(): string {
  return `DR${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export function classifyBarcodeLabels(variants: readonly Variant[]): ClassifiedBarcodeLabel[] {
  const active = variants.filter(variant => variant.variant_active && variant.product_active);
  const counts = new Map<string, number>();
  for (const variant of active) {
    const barcode = variant.barcode?.trim();
    if (barcode) counts.set(barcode, (counts.get(barcode) ?? 0) + 1);
  }
  return active.map(variant => {
    const barcode = variant.barcode?.trim();
    return {
      variant,
      state: !barcode ? 'missing' : (counts.get(barcode) ?? 0) > 1 ? 'ambiguous' : 'ready',
    };
  });
}

export function batchLabels<T>(items: readonly T[], size = LABEL_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('invalid_label_batch_size');
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
