/**
 * Payment-method reconciliation types (schema: payment_methods.reconciliation_type).
 * cash → blind_count, mpesa → transaction_verification, bank → statement_match,
 * credit → credit_ledger. Shared so every surface labels/types methods identically.
 */

/** Human label for a reconciliation type (settings list, selects, captions). */
export function reconciliationLabel(type: string | null | undefined): string {
  switch (type) {
    case 'blind_count':
      return 'Till count';
    case 'transaction_verification':
      return 'Transaction verification';
    case 'statement_match':
      return 'Statement matching';
    case 'credit_ledger':
      return 'Credit ledger';
    default:
      return '—';
  }
}

/** Statement-matched methods (bank) need a transaction reference before posting. */
export function isStatementMatch(type: string | null | undefined, code: string): boolean {
  if (type) return type === 'statement_match';
  // Fallback for cached/older data without the explicit type.
  return code === 'bank';
}

/** Last-resort type lookup by code for callers that only have method codes. */
export function reconciliationTypeForCode(code: string): string | null {
  switch (code) {
    case 'cash':
      return 'blind_count';
    case 'mpesa':
      return 'transaction_verification';
    case 'bank':
      return 'statement_match';
    case 'credit':
      return 'credit_ledger';
    default:
      return null;
  }
}
