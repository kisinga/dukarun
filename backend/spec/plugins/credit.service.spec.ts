import { describe, expect, it, jest } from '@jest/globals';
import { Order, OrderService, RequestContext } from '@vendure/core';
import { CreditService } from '../../src/services/credit/credit.service';
import { FinancialService } from '../../src/services/financial/financial.service';

describe('CreditService', () => {
  const ctx = {} as RequestContext;

  const createOrderService = (): OrderService => {
    return {} as OrderService;
  };

  const createFinancialService = (outstandingAmount: number): FinancialService => {
    return {
      getCustomerBalance: jest.fn().mockResolvedValue(outstandingAmount as never),
    } as unknown as FinancialService;
  };

  const createConnection = (orders: Order[] = []) => {
    const findOneMock = jest.fn().mockImplementation(async () => ({
      id: 'CUST_1',
      customFields: {
        isCreditApproved: true,
        creditLimit: 1000,
        outstandingAmount: 200, // This field is deprecated but may still exist
      },
    }));

    const saveMock = jest.fn();

    // Mock for Order repository queries (used by calculateOutstandingAmount)
    const findOrdersMock = jest.fn().mockResolvedValue(orders as never);

    const connection = {
      getRepository: jest.fn().mockImplementation((ctx, entity) => {
        // Return Order repository mock when querying for Order
        // Check by constructor name or use a more reliable method
        if (entity === Order || (entity && (entity as { name?: string }).name === 'Order')) {
          return {
            find: findOrdersMock,
          };
        }
        // Return Customer repository mock for Customer queries
        return {
          findOne: findOneMock,
          save: saveMock,
        };
      }),
    } as any;

    return { connection, findOneMock, saveMock, findOrdersMock };
  };

  it('computes available credit from summary', async () => {
    const { connection } = createConnection([]); // Customer data only; orders are ignored by CreditService
    const orderService = createOrderService();
    const financialService = createFinancialService(0); // No outstanding balance in ledger
    const service = new CreditService(connection, orderService, financialService);

    const summary = await service.getCreditSummary(ctx, 'CUST_1');

    expect(summary).toMatchObject({
      customerId: 'CUST_1',
      isCreditApproved: true,
      creditLimit: 1000,
      outstandingAmount: 0, // Calculated dynamically from orders (empty array)
      availableCredit: 1000, // creditLimit - outstandingAmount = 1000 - 0
    });
  });

  it('computes available credit with outstanding orders', async () => {
    const { connection } = createConnection();
    const orderService = createOrderService();
    const financialService = createFinancialService(200); // Ledger reports 200 outstanding
    const service = new CreditService(connection, orderService, financialService);

    const summary = await service.getCreditSummary(ctx, 'CUST_1');

    expect(summary).toMatchObject({
      customerId: 'CUST_1',
      isCreditApproved: true,
      creditLimit: 1000,
      outstandingAmount: 200, // 20000 cents / 100 = 200 base units
      availableCredit: 800, // creditLimit - outstandingAmount = 1000 - 200
    });
  });

  it('applies credit charge is a no-op (deprecated)', async () => {
    const { connection, saveMock } = createConnection();
    const orderService = createOrderService();
    const financialService = createFinancialService(0);
    const service = new CreditService(connection, orderService, financialService);

    await service.applyCreditCharge(ctx, 'CUST_1', 150);

    // applyCreditCharge is deprecated and does nothing (no-op)
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('releases credit charge updates repayment tracking fields', async () => {
    const { connection, saveMock } = createConnection();
    const orderService = createOrderService();
    const financialService = createFinancialService(0);
    const service = new CreditService(connection, orderService, financialService);

    await service.releaseCreditCharge(ctx, 'CUST_1', 150);

    // releaseCreditCharge updates lastRepaymentDate and lastRepaymentAmount
    expect(saveMock).toHaveBeenCalledTimes(1);
    const savedCustomer = saveMock.mock.calls[0][0] as { customFields: Record<string, unknown> };
    expect(savedCustomer.customFields).toMatchObject({
      lastRepaymentDate: expect.any(Date),
      lastRepaymentAmount: 150,
      // Other existing fields are preserved
      isCreditApproved: true,
      creditLimit: 1000,
    });
    // Note: outstandingAmount may still exist in customFields from the mock,
    // but it's not used - the actual outstanding amount is calculated dynamically
  });

  it('releases credit charge does nothing for zero or negative amounts', async () => {
    const { connection, saveMock } = createConnection();
    const orderService = createOrderService();
    const financialService = createFinancialService(0);
    const service = new CreditService(connection, orderService, financialService);

    await service.releaseCreditCharge(ctx, 'CUST_1', 0);
    expect(saveMock).not.toHaveBeenCalled();

    await service.releaseCreditCharge(ctx, 'CUST_1', -10);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
