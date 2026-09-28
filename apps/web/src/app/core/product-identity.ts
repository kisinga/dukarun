import type { CatalogIdentity } from './identity-lookup.services';

export interface HydratedProductIdentity {
  product_id: string;
  product_name: string;
  variant_name: string;
  stock_unit: string;
  sku: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  identity_resolution: 'resolved' | 'unresolved';
}

export function productIdentity(
  variant: CatalogIdentity | null | undefined
): HydratedProductIdentity {
  if (!variant) {
    return {
      product_id: '',
      product_name: 'Details unavailable',
      variant_name: '',
      stock_unit: '',
      sku: null,
      manufacturer_id: null,
      manufacturer_name: null,
      identity_resolution: 'unresolved',
    };
  }
  return {
    product_id: variant.product_id ?? '',
    product_name: variant.product_name ?? 'Details unavailable',
    variant_name: variant.variant_name ?? '',
    stock_unit: variant.stock_unit ?? '',
    sku: variant.sku ?? null,
    manufacturer_id: variant.manufacturer_id ?? null,
    manufacturer_name: variant.manufacturer_name ?? null,
    identity_resolution: 'resolved',
  };
}

export function productIdentityLabel(identity: {
  product_name: string;
  variant_name: string;
  identity_resolution?: 'resolved' | 'unresolved';
}): string {
  if (identity.identity_resolution === 'unresolved') return 'Details unavailable';
  return !identity.variant_name ||
    identity.variant_name === 'Default' ||
    identity.product_name === identity.variant_name ||
    identity.product_name.endsWith(' · ' + identity.variant_name) ||
    identity.product_name.endsWith(' — ' + identity.variant_name)
    ? identity.product_name
    : `${identity.product_name} — ${identity.variant_name}`;
}

export function manufacturerLabel(identity: {
  identity_resolution?: 'resolved' | 'unresolved';
  manufacturer_name?: string | null;
}): string {
  if (identity.identity_resolution === 'unresolved') return 'Details unavailable';
  return identity.manufacturer_name || 'Manufacturer not set';
}
