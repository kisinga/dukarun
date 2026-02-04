import { ReconciliationScope } from '../../domain/recon/reconciliation.entity';
import { AccountingPeriod } from '../../domain/period/accounting-period.entity';

/**
 * Discriminated union for reconciliation scope + ref.
 * scopeRefId in the DB is the string produced by toScopeRefId(ref).
 */
export type ReconciliationScopeRef =
  | { scope: 'cash-session'; sessionId: string }
  | { scope: 'method'; methodCode: string }
  | { scope: 'bank'; payoutId: string }
  | { scope: 'inventory'; stockLocationId: number | 'ALL' }
  | { scope: 'manual'; refId: string };

export function toScopeRefId(ref: ReconciliationScopeRef): string {
  switch (ref.scope) {
    case 'cash-session':
      return ref.sessionId;
    case 'method':
      return ref.methodCode;
    case 'bank':
      return ref.payoutId;
    case 'inventory':
      return ref.stockLocationId === 'ALL' ? 'ALL' : String(ref.stockLocationId);
    case 'manual':
      return ref.refId;
    default:
      return assertNever(ref);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unexpected reconciliation scope ref: ${JSON.stringify(x)}`);
}

export function fromScopeRefId(
  scope: ReconciliationScope,
  scopeRefId: string
): ReconciliationScopeRef {
  switch (scope) {
    case 'cash-session':
      return { scope: 'cash-session', sessionId: scopeRefId };
    case 'method':
      return { scope: 'method', methodCode: scopeRefId };
    case 'bank':
      return { scope: 'bank', payoutId: scopeRefId };
    case 'inventory':
      return {
        scope: 'inventory',
        stockLocationId: scopeRefId === 'ALL' ? 'ALL' : parseInt(scopeRefId, 10),
      };
    case 'manual':
      return { scope: 'manual', refId: scopeRefId };
    default:
      return assertNeverScope(scope);
  }
}

function assertNeverScope(x: never): never {
  throw new Error(`Unexpected reconciliation scope: ${x}`);
}

/**
 * Payment method reconciliation config (single source of truth).
 * Used by ReconciliationValidatorService, OpenSessionService, and GraphQL.
 */
export type PaymentMethodReconciliationConfig = {
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  reconciliationType: 'blind_count' | 'transaction_verification' | 'statement_match' | 'none';
  ledgerAccountCode: string;
  isCashierControlled: boolean;
  requiresReconciliation: boolean;
};

/**
 * Session reconciliation requirements (blind count, verification, payment methods).
 */
export type SessionReconciliationRequirements = {
  blindCountRequired: boolean;
  verificationRequired: boolean;
  paymentMethods: PaymentMethodReconciliationConfig[];
};

/**
 * Period Status
 * Current period state and reconciliation status
 */
export type PeriodStatus = {
  currentPeriod: AccountingPeriod | null;
  isLocked: boolean;
  lockEndDate: string | null;
  canClose: boolean;
  missingReconciliations: ReconciliationScope[];
};

/**
 * Period End Close Result
 * Result of period end closing operation
 */
export type PeriodEndCloseResult = {
  success: boolean;
  period: AccountingPeriod;
  reconciliationSummary: ReconciliationSummary;
};

/**
 * Reconciliation Summary
 * Summary of reconciliations by scope for a period
 */
export type ReconciliationSummary = {
  periodEndDate: string;
  scopes: ScopeReconciliationStatus[];
};

/**
 * Validation Result
 * Result of reconciliation validation
 */
export type ValidationResult = {
  isValid: boolean;
  errors: string[];
  missingReconciliations: MissingReconciliation[];
};

/**
 * Missing Reconciliation
 * Details about a missing reconciliation
 */
export type MissingReconciliation = {
  scope: ReconciliationScope;
  scopeRefId: string;
  displayName?: string;
};

/**
 * Reconciliation Status
 * Status of reconciliations for a period by scope
 */
export type ReconciliationStatus = {
  periodEndDate: string;
  scopes: ScopeReconciliationStatus[];
};

/**
 * Scope Reconciliation Status
 * Status of reconciliation for a specific scope
 */
export type ScopeReconciliationStatus = {
  scope: ReconciliationScope;
  scopeRefId: string;
  status: 'draft' | 'verified' | 'missing';
  varianceAmount?: string;
  displayName?: string;
};

/**
 * Inventory Valuation
 * Inventory valuation snapshot at a point in time
 */
export type InventoryValuation = {
  channelId: number;
  stockLocationId?: number;
  asOfDate: string;
  totalValue: string; // in smallest currency unit
  batchCount: number;
  itemCount: number;
};

/**
 * Inventory Reconciliation Result
 * Result of inventory reconciliation calculation
 */
export type InventoryReconciliationResult = {
  channelId: number;
  stockLocationId?: number;
  periodEndDate: string;
  ledgerBalance: string; // INVENTORY account balance from ledger
  inventoryValuation: string; // Calculated from inventory_batch
  variance: string; // ledgerBalance - inventoryValuation
};
