import { describe, expect, it } from 'vitest';
import { creditDocumentStatus } from './credit-document-status';

describe('creditDocumentStatus', () => {
  it('shows a zero-outstanding document as settled despite historical lateness', () => {
    expect(creditDocumentStatus({ outstanding_amount: 0, overdue_days: 85 })).toEqual({
      label: 'Settled',
      tone: 'success',
    });
  });

  it('shows aging only while a balance remains outstanding', () => {
    expect(creditDocumentStatus({ outstanding_amount: 100, overdue_days: 11 })).toEqual({
      label: '11d overdue',
      tone: 'warning',
    });
    expect(creditDocumentStatus({ outstanding_amount: 100, overdue_days: 61 })).toEqual({
      label: '61d overdue',
      tone: 'error',
    });
  });
});
