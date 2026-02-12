import { describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CreditService } from '../../src/services/credit/credit.service';
import { FinancialService } from '../../src/services/financial/financial.service';

describe('CreditService', () => {
  const ctx = {} as RequestContext;

  const createFinancialService = (
    customerBalance: number,
    supplierBalance = 0
  ): FinancialService => {
    return {
      getCustomerBalance: jest.fn().mockResolvedValue(customerBalance as never),
      getSupplierBalance: jest.fn().mockResolvedValue(supplierBalance as never),
    } as unknown as FinancialService;
  };

  const createConnection = (customFields: Record<string, unknown> = {}) => {
    const defaultCustomFields = {
      isCreditApproved: true,
      creditLimit: 1000,
      ...customFields,
    };

    const findOneMock = jest.fn().mockImplementation(async () => ({
      id: 'CUST_1',
      customFields: { ...defaultCustomFields },
    }));

    const saveMock = jest.fn();

    const connection = {
      getRepository: jest.fn().mockReturnValue({
        findOne: findOneMock,
        save: saveMock,
      }),
    } as any;

    return { connection, findOneMock, saveMock };
  };

  describe('customer credit', () => {
    it('computes available credit from summary', async () => {
      const { connection } = createConnection();
      const financialService = createFinancialService(0);
      const service = new CreditService(connection, financialService);

      const summary = await service.getCreditSummary(ctx, 'CUST_1', 'customer');

      expect(summary).toMatchObject({
        entityId: 'CUST_1',
        partyType: 'customer',
        isCreditApproved: true,
        creditLimit: 1000,
        outstandingAmount: 0,
        availableCredit: 1000,
      });
    });

    it('computes available credit with outstanding balance', async () => {
      const { connection } = createConnection();
      const financialService = createFinancialService(200);
      const service = new CreditService(connection, financialService);

      const summary = await service.getCreditSummary(ctx, 'CUST_1', 'customer');

      expect(summary).toMatchObject({
        entityId: 'CUST_1',
        isCreditApproved: true,
        creditLimit: 1000,
        outstandingAmount: 200,
        availableCredit: 800,
      });
    });

    it('recordRepayment updates repayment tracking fields', async () => {
      const { connection, saveMock } = createConnection();
      const financialService = createFinancialService(0);
      const service = new CreditService(connection, financialService);

      await service.recordRepayment(ctx, 'CUST_1', 'customer', 150);

      expect(saveMock).toHaveBeenCalledTimes(1);
      const savedCustomer = saveMock.mock.calls[0][0] as { customFields: Record<string, unknown> };
      expect(savedCustomer.customFields).toMatchObject({
        lastRepaymentDate: expect.any(Date),
        lastRepaymentAmount: 150,
        isCreditApproved: true,
        creditLimit: 1000,
      });
    });

    it('recordRepayment does nothing for zero or negative amounts', async () => {
      const { connection, saveMock } = createConnection();
      const financialService = createFinancialService(0);
      const service = new CreditService(connection, financialService);

      await service.recordRepayment(ctx, 'CUST_1', 'customer', 0);
      expect(saveMock).not.toHaveBeenCalled();

      await service.recordRepayment(ctx, 'CUST_1', 'customer', -10);
      expect(saveMock).not.toHaveBeenCalled();
    });
  });

  describe('supplier credit', () => {
    it('reads supplier-prefixed fields for supplier party type', async () => {
      const { connection } = createConnection({
        isSupplier: true,
        isSupplierCreditApproved: true,
        supplierCreditLimit: 5000,
        supplierCreditDuration: 60,
      });
      const financialService = createFinancialService(0, 1000);
      const service = new CreditService(connection, financialService);

      const summary = await service.getCreditSummary(ctx, 'CUST_1', 'supplier');

      expect(summary).toMatchObject({
        entityId: 'CUST_1',
        partyType: 'supplier',
        isCreditApproved: true,
        creditLimit: 5000,
        outstandingAmount: 1000,
        availableCredit: 4000,
        creditDuration: 60,
      });
    });

    it('throws if entity is not marked as supplier', async () => {
      const { connection } = createConnection({ isSupplier: false });
      const financialService = createFinancialService(0);
      const service = new CreditService(connection, financialService);

      await expect(service.getCreditSummary(ctx, 'CUST_1', 'supplier')).rejects.toThrow(
        'not marked as a supplier'
      );
    });

    it('approveCredit sets supplier-prefixed fields', async () => {
      const { connection, saveMock } = createConnection({
        isSupplier: true,
      });
      const financialService = createFinancialService(0, 0);
      const service = new CreditService(connection, financialService);

      await service.approveCredit(ctx, 'CUST_1', 'supplier', true, 3000, 45);

      expect(saveMock).toHaveBeenCalledTimes(1);
      const saved = saveMock.mock.calls[0][0] as { customFields: Record<string, unknown> };
      expect(saved.customFields).toMatchObject({
        isSupplierCreditApproved: true,
        supplierCreditLimit: 3000,
        supplierCreditDuration: 45,
      });
    });

    it('recordRepayment sets supplier-prefixed tracking fields', async () => {
      const { connection, saveMock } = createConnection({
        isSupplier: true,
        isSupplierCreditApproved: true,
        supplierCreditLimit: 5000,
      });
      const financialService = createFinancialService(0, 0);
      const service = new CreditService(connection, financialService);

      await service.recordRepayment(ctx, 'CUST_1', 'supplier', 500);

      expect(saveMock).toHaveBeenCalledTimes(1);
      const saved = saveMock.mock.calls[0][0] as { customFields: Record<string, unknown> };
      expect(saved.customFields).toMatchObject({
        supplierLastRepaymentDate: expect.any(Date),
        supplierLastRepaymentAmount: 500,
      });
    });
  });
});
