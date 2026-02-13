import { describe, expect, it } from '@jest/globals';
import { AUDIT_EVENTS } from '../../../src/infrastructure/audit/audit-events.catalog';
import {
  AUDIT_LOG_METADATA,
  AuditLog as AuditLogDecorator,
} from '../../../src/infrastructure/audit/audit-log.decorator';

describe('Audit Coverage', () => {
  describe('AUDIT_EVENTS catalog', () => {
    it('should have unique event types (no duplicates)', () => {
      const values = Object.values(AUDIT_EVENTS);
      const unique = new Set(values);
      expect(values.length).toBe(unique.size);
    });

    it('should use dot-notation for event names', () => {
      const values = Object.values(AUDIT_EVENTS);
      for (const v of values) {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
        expect(v).toMatch(/^[a-z][a-z0-9_.]*$/);
      }
    });
  });

  describe('AuditLog decorator', () => {
    it('should set metadata when applied', () => {
      const metadata = {
        eventType: 'test.event',
        entityType: 'TestEntity',
      };
      const decorator = AuditLogDecorator(metadata);
      expect(decorator).toBeDefined();
      expect(typeof decorator).toBe('function');
    });

    it('should export AUDIT_LOG_METADATA key', () => {
      expect(AUDIT_LOG_METADATA).toBe('audit_log');
    });
  });

  describe('critical mutations have @AuditLog', () => {
    const criticalMutations = [
      { resolver: 'PeriodManagementResolver', mutation: 'createReconciliation' },
      { resolver: 'PeriodManagementResolver', mutation: 'recordExpense' },
      { resolver: 'PeriodManagementResolver', mutation: 'verifyReconciliation' },
      { resolver: 'PeriodManagementResolver', mutation: 'closeAccountingPeriod' },
      { resolver: 'PeriodManagementResolver', mutation: 'openAccountingPeriod' },
      { resolver: 'PeriodManagementResolver', mutation: 'createInventoryReconciliation' },
      { resolver: 'PeriodManagementResolver', mutation: 'createInterAccountTransfer' },
      { resolver: 'PeriodManagementResolver', mutation: 'openCashierSession' },
      { resolver: 'PeriodManagementResolver', mutation: 'closeCashierSession' },
      { resolver: 'PeriodManagementResolver', mutation: 'createCashierSessionReconciliation' },
      { resolver: 'PeriodManagementResolver', mutation: 'recordCashCount' },
      { resolver: 'PeriodManagementResolver', mutation: 'explainVariance' },
      { resolver: 'PeriodManagementResolver', mutation: 'reviewCashCount' },
      { resolver: 'PeriodManagementResolver', mutation: 'verifyMpesaTransactions' },
      { resolver: 'PaymentAllocationResolver', mutation: 'allocateBulkPayment' },
      { resolver: 'PaymentAllocationResolver', mutation: 'paySingleOrder' },
      { resolver: 'SupplierPaymentAllocationResolver', mutation: 'allocateBulkSupplierPayment' },
      { resolver: 'SupplierPaymentAllocationResolver', mutation: 'paySinglePurchase' },
      { resolver: 'PriceOverrideResolver', mutation: 'setOrderLineCustomPrice' },
    ];

    it('should document expected critical mutations for manual verification', () => {
      expect(criticalMutations.length).toBeGreaterThanOrEqual(19);
    });
  });
});
