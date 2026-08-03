import { PermissionDefinition } from '@vendure/core';

export const OverridePricePermission = new PermissionDefinition({
  name: 'OverridePrice',
  description: 'Allows overriding order line prices during order creation',
});
