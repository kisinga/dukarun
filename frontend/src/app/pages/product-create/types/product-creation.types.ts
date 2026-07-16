export type ItemType = 'product' | 'service';
export type ProductType = 'measured' | 'discrete';

// High-level presets for how an item is sold.
// This drives the initial variant/measurement defaults in the 2-stage flow.
export type HowSoldPreset =
  | 'single-item' // One discrete SKU (e.g. single bottle)
  | 'multi-variant' // Discrete variants (e.g. sizes / pack sizes)
  | 'by-measure' // Measured by weight/volume/length (unit chosen from dropdown: Kg, L, m)
  | 'by-volume-litre'; // Custom: fractional toggle, optional unit, etc.

export interface VariantDimension {
  id: string;
  name: string;
  options: string[];
}

export interface ProductCreationState {
  itemType: ItemType;
  productType?: ProductType; // Only for products
  productName: string;
  identificationMethod: 'barcode' | 'label-photos' | null;
  barcode?: string;
  photoCount: number;

  // For MEASURED products
  measurementUnit?: string; // 'kg', 'L', 'm', etc.

  // For DISCRETE products
  variantDimensions: VariantDimension[];
}
