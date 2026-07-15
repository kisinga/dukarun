/**
 * Customer field resolver tests
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Customer, RequestContext } from '@vendure/core';
import { CustomerFieldResolver } from '../../../src/plugins/credit/customer.resolver';
import { CreditAgingService } from '../../../src/services/credit/credit-aging.service';
import { CreditService } from '../../../src/services/credit/credit.service';
import { SupplierCreditAgingService } from '../../../src/services/credit/supplier-credit-aging.service';

describe('CustomerFieldResolver', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let resolver: CustomerFieldResolver;
  let mockCreditService: jest.Mocked<CreditService>;
  let mockCreditAgingService: jest.Mocked<CreditAgingService>;
  let mockSupplierAgingService: jest.Mocked<SupplierCreditAgingService>;

  beforeEach(() => {
    mockCreditService = {
      getCreditSummary: jest.fn(),
    } as any;
    mockCreditAgingService = {
      getCustomerAging: jest.fn(),
    } as any;
    mockSupplierAgingService = {
      getSupplierAging: jest.fn(),
    } as any;
    resolver = new CustomerFieldResolver(
      mockCreditService,
      mockCreditAgingService,
      mockSupplierAgingService
    );
  });

  it('returns outstandingAmount from credit summary', async () => {
    const customer = { id: 'cust-1' } as Customer;
    mockCreditService.getCreditSummary.mockResolvedValue({ outstandingAmount: 12500 } as any);

    const result = await resolver.outstandingAmount(customer, ctx);

    expect(result).toBe(12500);
  });

  it('returns null when ledger balance cannot be computed', async () => {
    const customer = { id: 'cust-1' } as Customer;
    mockCreditService.getCreditSummary.mockRejectedValue(new Error('ledger unavailable'));

    const result = await resolver.outstandingAmount(customer, ctx);

    expect(result).toBeNull();
  });
});
