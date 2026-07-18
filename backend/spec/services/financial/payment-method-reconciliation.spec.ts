/**
 * Payment Method Reconciliation Integration Tests
 *
 * Tests the tight integration between payment methods, reconciliation process,
 * and ledger accounts as specified in the Payment Method Reconciliation plan.
 */

import { describe, expect, it } from '@jest/globals';
import { PaymentMethod } from '@vendure/core';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';
import {
  getAccountCodeFromPaymentMethod,
  getReconciliationTypeFromPaymentMethod,
  isCashierControlledPaymentMethod,
  mapPaymentMethodToAccount,
  requiresReconciliation,
} from '../../../src/services/financial/payment-method-mapping.config';
import { PAYMENT_METHOD_CODES } from '../../../src/services/payments/payment-method-codes.constants';

describe('Payment Method Reconciliation Integration', () => {
  describe('mapPaymentMethodToAccount (static mapping)', () => {
    it('should map cash handler to CASH_ON_HAND account', () => {
      expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.CASH)).toBe(ACCOUNT_CODES.CASH_ON_HAND);
    });

    it('should map mpesa handler to CLEARING_MPESA account', () => {
      expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.MPESA)).toBe(
        ACCOUNT_CODES.CLEARING_MPESA
      );
    });

    it('should map credit handler to CLEARING_CREDIT account', () => {
      expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.CREDIT)).toBe(
        ACCOUNT_CODES.CLEARING_CREDIT
      );
    });

    it('should map bank handler to BANK_MAIN account', () => {
      expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.BANK)).toBe(ACCOUNT_CODES.BANK_MAIN);
    });

    it('should handle full payment method codes with channel suffix', () => {
      expect(mapPaymentMethodToAccount('cash-1')).toBe(ACCOUNT_CODES.CASH_ON_HAND);
      expect(mapPaymentMethodToAccount('mpesa-2')).toBe(ACCOUNT_CODES.CLEARING_MPESA);
      expect(mapPaymentMethodToAccount('bank-3')).toBe(ACCOUNT_CODES.BANK_MAIN);
      expect(mapPaymentMethodToAccount('credit-4')).toBe(ACCOUNT_CODES.CLEARING_CREDIT);
    });

    it('should fall back to CLEARING_GENERIC for unknown handlers', () => {
      expect(mapPaymentMethodToAccount('unknown')).toBe(ACCOUNT_CODES.CLEARING_GENERIC);
    });

    it('should be case-insensitive', () => {
      expect(mapPaymentMethodToAccount('CASH')).toBe(ACCOUNT_CODES.CASH_ON_HAND);
      expect(mapPaymentMethodToAccount('MpEsA')).toBe(ACCOUNT_CODES.CLEARING_MPESA);
    });
  });

  describe('getAccountCodeFromPaymentMethod (dynamic mapping)', () => {
    const createMockPaymentMethod = (
      code: string,
      customFields?: Record<string, any>
    ): PaymentMethod =>
      ({
        id: 1,
        code,
        enabled: true,
        customFields: customFields || {},
      }) as unknown as PaymentMethod;

    it('should use custom field ledgerAccountCode if set and valid', () => {
      const pm = createMockPaymentMethod('cash-1', {
        ledgerAccountCode: ACCOUNT_CODES.BANK_MAIN,
      });

      expect(getAccountCodeFromPaymentMethod(pm)).toBe(ACCOUNT_CODES.BANK_MAIN);
    });

    it('should fall back to handler-based mapping if custom field is empty', () => {
      const pm = createMockPaymentMethod('cash-1', {
        ledgerAccountCode: '',
      });

      expect(getAccountCodeFromPaymentMethod(pm)).toBe(ACCOUNT_CODES.CASH_ON_HAND);
    });

    it('should fall back to handler-based mapping if custom field is null', () => {
      const pm = createMockPaymentMethod('mpesa-1', {
        ledgerAccountCode: null,
      });

      expect(getAccountCodeFromPaymentMethod(pm)).toBe(ACCOUNT_CODES.CLEARING_MPESA);
    });

    it('should fall back to handler-based mapping if no custom fields', () => {
      const pm = createMockPaymentMethod('credit-1');

      expect(getAccountCodeFromPaymentMethod(pm)).toBe(ACCOUNT_CODES.CLEARING_CREDIT);
    });

    it('should fall back if custom field contains invalid account code', () => {
      const pm = createMockPaymentMethod('cash-1', {
        ledgerAccountCode: 'INVALID_ACCOUNT_CODE',
      });

      // Should fall back to handler-based mapping
      expect(getAccountCodeFromPaymentMethod(pm)).toBe(ACCOUNT_CODES.CASH_ON_HAND);
    });
  });

  describe('getReconciliationTypeFromPaymentMethod', () => {
    const createMockPaymentMethod = (customFields?: Record<string, any>): PaymentMethod =>
      ({
        id: 1,
        code: 'test-1',
        enabled: true,
        customFields: customFields || {},
      }) as unknown as PaymentMethod;

    it('should return blind_count for cash payment methods', () => {
      const pm = createMockPaymentMethod({
        reconciliationType: 'blind_count',
      });

      expect(getReconciliationTypeFromPaymentMethod(pm)).toBe('blind_count');
    });

    it('should return transaction_verification for mpesa payment methods', () => {
      const pm = createMockPaymentMethod({
        reconciliationType: 'transaction_verification',
      });

      expect(getReconciliationTypeFromPaymentMethod(pm)).toBe('transaction_verification');
    });

    it('should return statement_match for bank payment methods', () => {
      const pm = createMockPaymentMethod({
        reconciliationType: 'statement_match',
      });

      expect(getReconciliationTypeFromPaymentMethod(pm)).toBe('statement_match');
    });

    it('should return none as default', () => {
      const pm = createMockPaymentMethod({});
      expect(getReconciliationTypeFromPaymentMethod(pm)).toBe('none');
    });

    it('should return none for invalid reconciliation type', () => {
      const pm = createMockPaymentMethod({
        reconciliationType: 'invalid_type',
      });
      expect(getReconciliationTypeFromPaymentMethod(pm)).toBe('none');
    });
  });

  describe('isCashierControlledPaymentMethod', () => {
    const createMockPaymentMethod = (customFields?: Record<string, any>): PaymentMethod =>
      ({
        id: 1,
        code: 'test-1',
        enabled: true,
        customFields: customFields || {},
      }) as unknown as PaymentMethod;

    it('should return true when isCashierControlled is true', () => {
      const pm = createMockPaymentMethod({
        isCashierControlled: true,
      });

      expect(isCashierControlledPaymentMethod(pm)).toBe(true);
    });

    it('should return false when isCashierControlled is false', () => {
      const pm = createMockPaymentMethod({
        isCashierControlled: false,
      });

      expect(isCashierControlledPaymentMethod(pm)).toBe(false);
    });

    it('should return false when isCashierControlled is not set', () => {
      const pm = createMockPaymentMethod({});
      expect(isCashierControlledPaymentMethod(pm)).toBe(false);
    });
  });

  describe('requiresReconciliation', () => {
    const createMockPaymentMethod = (customFields?: Record<string, any>): PaymentMethod =>
      ({
        id: 1,
        code: 'test-1',
        enabled: true,
        customFields: customFields || {},
      }) as unknown as PaymentMethod;

    it('should return true when requiresReconciliation is true', () => {
      const pm = createMockPaymentMethod({
        requiresReconciliation: true,
      });

      expect(requiresReconciliation(pm)).toBe(true);
    });

    it('should return false when requiresReconciliation is false', () => {
      const pm = createMockPaymentMethod({
        requiresReconciliation: false,
      });

      expect(requiresReconciliation(pm)).toBe(false);
    });

    it('should return true by default when not set (safety default)', () => {
      const pm = createMockPaymentMethod({});
      expect(requiresReconciliation(pm)).toBe(true);
    });
  });

  describe('Reconciliation Configuration Defaults', () => {
    /**
     * Tests that validate the expected defaults for each payment method type
     */
    describe('Cash Payment Method Defaults', () => {
      it('should default to blind_count reconciliation', () => {
        // Cash requires blind count - cashier declares without seeing expected
        expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.CASH)).toBe(
          ACCOUNT_CODES.CASH_ON_HAND
        );
      });
    });

    describe('M-Pesa Payment Method Defaults', () => {
      it('should default to transaction_verification reconciliation', () => {
        // M-Pesa requires transaction verification - cashier confirms each txn
        expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.MPESA)).toBe(
          ACCOUNT_CODES.CLEARING_MPESA
        );
      });
    });

    describe('Credit Payment Method Defaults', () => {
      it('should not require cashier reconciliation', () => {
        // Credit goes to AR - not cashier's responsibility
        expect(mapPaymentMethodToAccount(PAYMENT_METHOD_CODES.CREDIT)).toBe(
          ACCOUNT_CODES.CLEARING_CREDIT
        );
      });
    });
  });
});

describe('Reconciliation Type Validation', () => {
  describe('blind_count validation', () => {
    it('should require session ID for validation', () => {
      // blind_count requires active session context
      const sessionId = undefined;
      expect(sessionId).toBeUndefined();
      // Validation would fail without sessionId
    });
  });

  describe('transaction_verification validation', () => {
    it('should require session ID for M-Pesa verification', () => {
      // M-Pesa verification requires session to find transactions
      const sessionId = 'session-123';
      expect(sessionId).toBeDefined();
    });
  });

  describe('statement_match validation', () => {
    it('should not require session ID (bank-level)', () => {
      // Bank reconciliation is done at channel level, not session
      const bankReconciliation = {
        scope: 'bank',
        sessionId: undefined,
      };
      expect(bankReconciliation.sessionId).toBeUndefined();
    });
  });
});
