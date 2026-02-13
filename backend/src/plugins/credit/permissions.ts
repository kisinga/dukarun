import { PermissionDefinition } from '@vendure/core';

export const ApproveCustomerCreditPermission = new PermissionDefinition({
  name: 'ApproveCustomerCredit',
  description: 'Allows approving or revoking customer credit access.',
});

export const ManageCustomerCreditLimitPermission = new PermissionDefinition({
  name: 'ManageCustomerCreditLimit',
  description: 'Allows setting and adjusting customer credit limits.',
});

export const ReverseOrderPermission = new PermissionDefinition({
  name: 'ReverseOrder',
  description: 'Allows reversing an order (ledger reversal and mark order reversed).',
});
