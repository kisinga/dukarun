/**
 * Customer field resolver tests
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Customer, ListQueryBuilder, RequestContext } from '@vendure/core';
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
  let mockListQueryBuilder: jest.Mocked<ListQueryBuilder>;

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
    mockListQueryBuilder = {
      build: jest.fn(),
    } as any;
    resolver = new CustomerFieldResolver(
      mockCreditService,
      mockCreditAgingService,
      mockSupplierAgingService,
      mockListQueryBuilder
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

  it('resolves customer orders with a non-reserved alias and customer filter', async () => {
    const customer = { id: 'cust-1' } as Customer;
    const mockQb: any = {
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[{ id: 'order-1' }], 1]),
    };
    mockListQueryBuilder.build.mockReturnValue(mockQb);

    const result = await resolver.orders(ctx, customer, { options: { take: 10 } }, []);

    expect(mockListQueryBuilder.build).toHaveBeenCalledWith(
      expect.any(Function),
      { take: 10 },
      expect.objectContaining({ entityAlias: 'orderEntity' })
    );
    expect(mockQb.andWhere).toHaveBeenCalledWith('orderEntity.state != :draftState', {
      draftState: 'Draft',
    });
    expect(mockQb.andWhere).toHaveBeenCalledWith('orderEntity.customerId = :customerId', {
      customerId: 'cust-1',
    });
    expect(result.items).toHaveLength(1);
    expect(result.totalItems).toBe(1);
  });
});
