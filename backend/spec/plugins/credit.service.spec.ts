import { describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CreditService } from '../../src/services/credit/credit.service';
import { FinancialService } from '../../src/services/financial/financial.service';
import { LedgerQueryService } from '../../src/services/financial/ledger-query.service';

describe('CreditService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;

  const createFinancialService = (
    customerBalance: number,
    supplierBalance = 0
  ): FinancialService => {
    return {
      getCustomerBalance: jest.fn().mockResolvedValue(customerBalance as never),
      getSupplierBalance: jest.fn().mockResolvedValue(supplierBalance as never),
      adjustCustomerBalance: jest.fn().mockResolvedValue({
        previousBalance: customerBalance,
        newBalance: customerBalance,
        adjustmentAmount: 0,
      } as never),
      adjustSupplierBalance: jest.fn().mockResolvedValue({
        previousBalance: supplierBalance,
        newBalance: supplierBalance,
        adjustmentAmount: 0,
      } as never),
    } as unknown as FinancialService;
  };

  const createConnection = (
    customFields: Record<string, unknown> = {},
    options: {
      orders?: Array<{ id: string; total: number; totalWithTax: number; payments: any[] }>;
      purchases?: Array<{
        id: string;
        totalCost: number;
        isCreditPurchase: boolean;
        paymentStatus?: string;
        payments: any[];
      }>;
      customerIds?: number[];
      supplierIds?: number[];
    } = {}
  ) => {
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

    const repo: any = {
      findOne: findOneMock,
      save: saveMock,
      find: jest.fn().mockImplementation(async () => {
        // In these tests we only provide orders OR purchases, never both.
        return (options.purchases || []).length > 0 ? options.purchases : options.orders || [];
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const rawRows =
          (options.purchases || []).length > 0
            ? (options.supplierIds || []).map(id => ({ supplierId: id }))
            : (options.customerIds || []).map(id => ({ customerId: id }));
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: (jest.fn() as any).mockResolvedValue(rawRows as any),
        };
      }),
    };

    const connection = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        const entityName = String(entity?.name ?? entity ?? '');
        const isPurchase = entityName === 'StockPurchase' || entityName.includes('Purchase');
        repo.__entityType = isPurchase ? 'purchase' : 'order';
        return repo;
      }),
      withTransaction: jest.fn(async (_ctx: any, fn: any) => fn(_ctx)),
    } as any;

    return { connection, findOneMock, saveMock, repo };
  };

  const createLedgerQueryService = (
    signedCustomerBalance = 0,
    signedSupplierBalance = 0
  ): LedgerQueryService => {
    return {
      getAccountBalance: jest.fn().mockImplementation(async (query: any) => {
        if (query.accountCode === 'ACCOUNTS_RECEIVABLE') {
          return { balance: signedCustomerBalance };
        }
        return { balance: signedSupplierBalance };
      }),
    } as unknown as LedgerQueryService;
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

  describe('residual divergence', () => {
    it('detects customer residual divergence', async () => {
      const { connection } = createConnection(
        {},
        {
          customerIds: [1],
          orders: [
            {
              id: 'order-1',
              total: 10000,
              totalWithTax: 10000,
              payments: [{ state: 'Settled', amount: 0 }],
            },
          ],
        }
      );
      const financialService = createFinancialService(0);
      const ledgerQueryService = createLedgerQueryService(8000); // ledger says 8000 owed
      const service = new CreditService(connection, financialService, ledgerQueryService);

      const result = await service.findCustomerSupplierDivergences(ctx, 'customer');

      expect(result.totalItems).toBe(1);
      expect(result.items[0]).toMatchObject({
        entityId: '1',
        modelBalance: 10000,
        signedLedgerBalance: 8000,
        residual: 2000,
      });
    });

    it('detects supplier residual divergence including paid purchases', async () => {
      const { connection, repo } = createConnection(
        { isSupplier: true },
        {
          supplierIds: [1],
          purchases: [
            {
              id: 'purchase-1',
              totalCost: 10000,
              isCreditPurchase: true,
              paymentStatus: 'paid',
              payments: [{ amount: 5000 }],
            },
          ],
        }
      );
      const financialService = createFinancialService(0, 0);
      const ledgerQueryService = createLedgerQueryService(0, -3000); // ledger says 3000 owed
      const service = new CreditService(connection, financialService, ledgerQueryService);

      const result = await service.findCustomerSupplierDivergences(ctx, 'supplier');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isCreditPurchase: true }),
        })
      );
      expect(result.totalItems).toBe(1);
      expect(result.items[0]).toMatchObject({
        entityId: '1',
        modelBalance: 5000,
        signedLedgerBalance: -3000,
        residual: 2000,
      });
    });

    it('adjusts customer balance to model', async () => {
      const { connection } = createConnection(
        {},
        {
          customerIds: [1],
          orders: [
            {
              id: 'order-1',
              total: 10000,
              totalWithTax: 10000,
              payments: [{ state: 'Settled', amount: 0 }],
            },
          ],
        }
      );
      const financialService = createFinancialService(0);
      const ledgerQueryService = createLedgerQueryService(8000);
      const service = new CreditService(connection, financialService, ledgerQueryService);

      await service.adjustCustomerBalanceToModel(ctx, '1');

      expect(financialService.adjustCustomerBalance).toHaveBeenCalledWith(
        ctx,
        '1',
        10000,
        expect.stringContaining('trust model')
      );
    });

    it('adjusts supplier balance to model', async () => {
      const { connection } = createConnection(
        { isSupplier: true },
        {
          supplierIds: [1],
          purchases: [
            {
              id: 'purchase-1',
              totalCost: 10000,
              isCreditPurchase: true,
              paymentStatus: 'paid',
              payments: [{ amount: 5000 }],
            },
          ],
        }
      );
      const financialService = createFinancialService(0, 0);
      const ledgerQueryService = createLedgerQueryService(0, -3000);
      const service = new CreditService(connection, financialService, ledgerQueryService);

      await service.adjustSupplierBalanceToModel(ctx, '1');

      expect(financialService.adjustSupplierBalance).toHaveBeenCalledWith(
        ctx,
        '1',
        5000,
        expect.stringContaining('trust model')
      );
    });
  });
});
