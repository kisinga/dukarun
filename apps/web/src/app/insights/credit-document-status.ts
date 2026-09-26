import type { CreditDocumentPerformance } from './insights.models';

export interface CreditDocumentStatus {
  label: string;
  tone: 'success' | 'warning' | 'error';
}

/** Current collection status. Historical payment delay must never look like open aging. */
export function creditDocumentStatus(
  document: Pick<CreditDocumentPerformance, 'outstanding_amount' | 'overdue_days'>
): CreditDocumentStatus {
  if (document.outstanding_amount <= 0) return { label: 'Settled', tone: 'success' };
  if (document.overdue_days > 30) {
    return { label: `${document.overdue_days}d overdue`, tone: 'error' };
  }
  if (document.overdue_days > 0) {
    return { label: `${document.overdue_days}d overdue`, tone: 'warning' };
  }
  return { label: 'Current', tone: 'success' };
}
