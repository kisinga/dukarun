import type { Variant } from '../pos/pos.service';

export function variantNeedsRestock(
  variant: Pick<Variant, 'kind' | 'track_inventory' | 'variant_active' | 'product_active'>,
  stock: number,
  threshold: number
): boolean {
  return (
    variant.kind !== 'service' &&
    variant.track_inventory === true &&
    variant.variant_active !== false &&
    variant.product_active !== false &&
    stock <= threshold
  );
}
