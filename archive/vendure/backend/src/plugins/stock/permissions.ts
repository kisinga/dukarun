import { PermissionDefinition } from '@vendure/core';

export const ManageStockAdjustmentsPermission = new PermissionDefinition({
  name: 'ManageStockAdjustments',
  description: 'Allows recording stock adjustments for inventory corrections.',
});
