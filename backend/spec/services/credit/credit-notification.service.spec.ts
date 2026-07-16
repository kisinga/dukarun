import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventBus, RequestContext } from '@vendure/core';
import {
  CreditAgingService,
  CustomerCreditAging,
} from '../../../src/services/credit/credit-aging.service';
import { CreditNotificationCheckpointService } from '../../../src/services/credit/credit-notification-checkpoint.service';
import { CreditNotificationService } from '../../../src/services/credit/credit-notification.service';
import { CreditService } from '../../../src/services/credit/credit.service';
import { OutboundDeliveryService } from '../../../src/services/notifications/outbound-delivery.service';

function buildMocks() {
  const creditAgingService = {
    findCustomersWithOutstanding: jest.fn(),
    getCustomerAging: jest.fn(),
  } as unknown as CreditAgingService;

  const creditService = {
    getBalance: jest.fn(),
    freezeCustomerCredit: jest.fn(),
  } as unknown as CreditService;

  const checkpointService = {
    clearOldCheckpoints: jest.fn(),
    clearCheckpoints: jest.fn(),
    hasCheckpoint: jest.fn(),
    createCheckpoint: jest.fn(),
  } as unknown as CreditNotificationCheckpointService;

  const outboundDelivery = {
    deliver: jest.fn(),
  } as unknown as OutboundDeliveryService;

  const eventBus = {
    publish: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as EventBus;

  const service = new CreditNotificationService(
    creditAgingService,
    creditService,
    checkpointService,
    outboundDelivery,
    eventBus
  );

  return {
    service,
    creditAgingService,
    creditService,
    checkpointService,
    outboundDelivery,
    eventBus,
  };
}

function buildAging(overrides: Partial<CustomerCreditAging> = {}): CustomerCreditAging {
  return {
    customerId: 'cust-1',
    customerName: 'Test Customer',
    phoneNumber: null,
    outstandingAmount: 100000,
    creditLimit: 200000,
    creditDurationDays: 30,
    availableCredit: 100000,
    utilizationPercent: 0.5,
    oldestOrder: null,
    daysOverdue: 0,
    lastRepaymentDate: null,
    ...overrides,
  };
}

describe('CreditNotificationService', () => {
  const ctx = { channelId: 1 } as RequestContext;

  beforeEach(() => {
    jest.useRealTimers();
  });

  it('clears checkpoints when the balance is fully repaid', async () => {
    const mocks = buildMocks();
    (
      mocks.creditAgingService.findCustomersWithOutstanding as jest.MockedFunction<
        CreditAgingService['findCustomersWithOutstanding']
      >
    ).mockResolvedValue(['cust-1']);
    (
      mocks.creditService.getBalance as jest.MockedFunction<CreditService['getBalance']>
    ).mockResolvedValue(0);

    const result = await mocks.service.runDailyScan(ctx);

    expect(result.customersScanned).toBe(1);
    expect(result.notificationsSent).toBe(0);
    expect(mocks.checkpointService.clearCheckpoints).toHaveBeenCalledWith(
      ctx,
      'credit_reminder',
      'cust-1'
    );
    expect(mocks.outboundDelivery.deliver).not.toHaveBeenCalled();
  });

  it('sends a 10-day freeze reminder and freezes the account', async () => {
    const mocks = buildMocks();
    (
      mocks.creditAgingService.findCustomersWithOutstanding as jest.MockedFunction<
        CreditAgingService['findCustomersWithOutstanding']
      >
    ).mockResolvedValue(['cust-1']);
    (
      mocks.creditService.getBalance as jest.MockedFunction<CreditService['getBalance']>
    ).mockResolvedValue(100000);
    (
      mocks.creditAgingService.getCustomerAging as jest.MockedFunction<
        CreditAgingService['getCustomerAging']
      >
    ).mockResolvedValue(buildAging({ daysOverdue: 10 }));
    (
      mocks.checkpointService.hasCheckpoint as jest.MockedFunction<
        CreditNotificationCheckpointService['hasCheckpoint']
      >
    ).mockResolvedValue(false);

    const result = await mocks.service.runDailyScan(ctx);

    expect(result.notificationsSent).toBe(1);
    expect(result.customersFrozen).toBe(1);
    expect(mocks.creditService.freezeCustomerCredit).toHaveBeenCalledWith(
      ctx,
      'cust-1',
      'customer',
      '10 days overdue'
    );
    expect(mocks.outboundDelivery.deliver).toHaveBeenCalledWith(
      ctx,
      'credit_period_10_days_frozen',
      expect.objectContaining({ customerId: 'cust-1', systemGenerated: true })
    );
    expect(mocks.checkpointService.createCheckpoint).toHaveBeenCalledWith(
      ctx,
      'credit_reminder',
      'cust-1',
      'period_10_days_frozen'
    );
  });

  it('prefers the 7-day overdue bucket over a limit warning', async () => {
    const mocks = buildMocks();
    (
      mocks.creditAgingService.findCustomersWithOutstanding as jest.MockedFunction<
        CreditAgingService['findCustomersWithOutstanding']
      >
    ).mockResolvedValue(['cust-1']);
    (
      mocks.creditService.getBalance as jest.MockedFunction<CreditService['getBalance']>
    ).mockResolvedValue(85000);
    (
      mocks.creditAgingService.getCustomerAging as jest.MockedFunction<
        CreditAgingService['getCustomerAging']
      >
    ).mockResolvedValue(
      buildAging({
        daysOverdue: 7,
        outstandingAmount: 85000,
        creditLimit: 100000,
        utilizationPercent: 0.85,
      })
    );
    (
      mocks.checkpointService.hasCheckpoint as jest.MockedFunction<
        CreditNotificationCheckpointService['hasCheckpoint']
      >
    ).mockResolvedValue(false);

    await mocks.service.runDailyScan(ctx);

    expect(mocks.outboundDelivery.deliver).toHaveBeenCalledWith(
      ctx,
      'credit_period_7_days',
      expect.anything()
    );
  });

  it('sends the limit near bucket at 90% utilization', async () => {
    const mocks = buildMocks();
    (
      mocks.creditAgingService.findCustomersWithOutstanding as jest.MockedFunction<
        CreditAgingService['findCustomersWithOutstanding']
      >
    ).mockResolvedValue(['cust-1']);
    (
      mocks.creditService.getBalance as jest.MockedFunction<CreditService['getBalance']>
    ).mockResolvedValue(90000);
    (
      mocks.creditAgingService.getCustomerAging as jest.MockedFunction<
        CreditAgingService['getCustomerAging']
      >
    ).mockResolvedValue(
      buildAging({
        daysOverdue: 2,
        outstandingAmount: 90000,
        creditLimit: 100000,
        utilizationPercent: 0.9,
      })
    );
    (
      mocks.checkpointService.hasCheckpoint as jest.MockedFunction<
        CreditNotificationCheckpointService['hasCheckpoint']
      >
    ).mockResolvedValue(false);

    await mocks.service.runDailyScan(ctx);

    expect(mocks.outboundDelivery.deliver).toHaveBeenCalledWith(
      ctx,
      'credit_limit_near',
      expect.anything()
    );
  });
});
