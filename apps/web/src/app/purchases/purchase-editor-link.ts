export type LinkedSupplier = { id: string; supplier_active: boolean };

export type LinkedSupplierResolution =
  { supplierId: string; error: null } | { supplierId: null; error: string };

export function resolveLinkedSupplier(
  requestedSupplierId: string,
  suppliers: readonly LinkedSupplier[]
): LinkedSupplierResolution {
  const supplier = suppliers.find(item => item.id === requestedSupplierId);
  if (!supplier) return { supplierId: null, error: 'The linked supplier was not found' };
  if (!supplier.supplier_active) {
    return { supplierId: null, error: 'The linked supplier is archived' };
  }
  return { supplierId: supplier.id, error: null };
}
