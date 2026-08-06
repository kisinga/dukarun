/**
 * Supplier payment method mapping tests
 */

import { describe, expect, it } from '@jest/globals';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';
import { debitAccountCodeToPaymentMethodCode } from '../../../src/services/financial/payment-method-mapping.config';
import { PAYMENT_METHOD_CODES } from '../../../src/services/payments/payment-method-codes.constants';

describe('debitAccountCodeToPaymentMethodCode', () => {
  it('maps CASH_ON_HAND to cash', () => {
    expect(debitAccountCodeToPaymentMethodCode(ACCOUNT_CODES.CASH_ON_HAND)).toBe(
      PAYMENT_METHOD_CODES.CASH
    );
  });

  it('maps CLEARING_MPESA to mpesa', () => {
    expect(debitAccountCodeToPaymentMethodCode(ACCOUNT_CODES.CLEARING_MPESA)).toBe(
      PAYMENT_METHOD_CODES.MPESA
    );
  });

  it('maps BANK_MAIN to bank', () => {
    expect(debitAccountCodeToPaymentMethodCode(ACCOUNT_CODES.BANK_MAIN)).toBe(
      PAYMENT_METHOD_CODES.BANK
    );
  });

  it('falls back to cash for unknown accounts', () => {
    expect(debitAccountCodeToPaymentMethodCode('UNKNOWN')).toBe(PAYMENT_METHOD_CODES.CASH);
  });

  it('trims whitespace from the account code', () => {
    expect(debitAccountCodeToPaymentMethodCode(`  ${ACCOUNT_CODES.BANK_MAIN}  `)).toBe(
      PAYMENT_METHOD_CODES.BANK
    );
  });
});
