import { PermissionDefinition } from '@vendure/core';

export const ManageSupplierCreditPurchasesPermission = new PermissionDefinition({
  name: 'ManageSupplierCreditPurchases',
  description:
    'Allows managing supplier credit purchases, including approval, limit management, and bulk payments.',
});
