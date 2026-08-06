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

export const OverrideCustomerBalancePermission = new PermissionDefinition({
  name: 'OverrideCustomerBalance',
  description: 'Allows overriding a customer balance via ledger adjustment entry.',
});

/**
 * Allows settling an order at the cashier: collecting payment (one or more tenders,
 * i.e. a split payment) against a parked or credit order and posting it to the ledger.
 *
 * Dedicated (rather than reusing UpdateOrder) so a shop can grant "take money at the
 * counter" without granting full order editing. Seeded to the same roles that already
 * hold UpdateOrder (admin + cashier); operational sales/stock roles do not settle.
 */
export const SettleOrderPermission = new PermissionDefinition({
  name: 'SettleOrder',
  description:
    'Allows settling orders at the cashier, including split payments across multiple tenders.',
});
