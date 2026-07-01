import { PermissionDefinition } from '@vendure/core';

/**
 * Read access to business financial figures: ledger balances, account balances,
 * period status, reconciliation reporting, inventory valuation.
 *
 * Distinct from (and narrower than) the built-in ReadOrder these endpoints
 * previously used — ReadOrder is held by operational roles (e.g. salesperson)
 * who should not see business financials. Granted to admin/accountant only.
 * Cashiers are NOT granted this; the reconciliation/session reads they need are
 * gated to ManageReconciliation instead. Operational shift-status reads
 * (currentCashierSession, cashierSessions) stay on ReadOrder so the POS/sell
 * page keeps working for all roles.
 */
export const ViewFinancialsPermission = new PermissionDefinition({
  name: 'ViewFinancials',
  description:
    'Allows viewing business financial figures (balances, period status, reconciliation reporting).',
});

export const ManageReconciliationPermission = new PermissionDefinition({
  name: 'ManageReconciliation',
  description: 'Allows creating and verifying reconciliations for all scopes.',
});

export const CloseAccountingPeriodPermission = new PermissionDefinition({
  name: 'CloseAccountingPeriod',
  description: 'Allows closing accounting periods after reconciliation verification.',
});

export const CreateInterAccountTransferPermission = new PermissionDefinition({
  name: 'CreateInterAccountTransfer',
  description: 'Allows creating inter-account transfers during reconciliation sessions.',
});
