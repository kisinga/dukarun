# Sensitive actions and cache overrides

After any mutation that changes list or detail data (delete product, create/edit product, create/edit/delete customer or supplier), the app must refetch with fresh data (network-only) or invalidate cache so users never see stale results.

## Checklist: action → required follow-up

| Action           | Where                                   | Required follow-up                                                                 |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Delete product   | products.component `onDeleteConfirmed`  | Call `refreshProducts()` (which uses network-only).                                |
| Create product  | product-create.component success        | Navigate to list with `?refresh=1`; list refetches with network-only.               |
| Edit product    | product-edit.component success          | Same as create.                                                                     |
| Delete customer | customers.component                     | Call `refreshCustomers()` (uses network-only).                                     |
| Create customer | customer-create success                 | Navigate to list with `?refresh=1`; list refetches with network-only.               |
| Delete supplier | suppliers.component                     | Call `refreshSuppliers()` (uses network-only).                                      |
| Create supplier | supplier-create success                 | Navigate to list with `?refresh=1` or parent calls `refreshSuppliers()` (modal).   |

**Rule:** Any new mutation that affects a list or detail view must be added to this table and must trigger either a refetch with network-only or a cache invalidation.
