/**
 * CustomerResolver tests
 *
 * Covers duplicate prevention and routing to the correct creation path.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Channel,
  Customer,
  CustomerEvent,
  CustomerService,
  EventBus,
  RequestContext,
  User,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { CustomerResolver } from '../../../src/plugins/customers/customer.resolver';
import { CustomerCreationService } from '../../../src/services/customers/customer-creation.service';
import { CustomerLookupService } from '../../../src/services/customers/customer-lookup.service';

describe('CustomerResolver', () => {
  let resolver: CustomerResolver;

  const mockCustomerService = {
    create: jest.fn(),
  };

  const mockCustomerCreationService = {
    create: jest.fn(),
  };

  const mockCustomerLookupService = {
    findCustomerByPhoneIncludingDeleted: jest.fn(),
  };

  const mockEventBus = {
    publish: jest.fn().mockResolvedValue(undefined as never),
  };

  const mockConnection: any = {
    getRepository: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new CustomerResolver(
      mockCustomerService as unknown as CustomerService,
      mockCustomerCreationService as unknown as CustomerCreationService,
      mockCustomerLookupService as unknown as CustomerLookupService,
      mockEventBus as unknown as EventBus,
      mockConnection as any
    );
  });

  const ctx = {
    channelId: 1,
    channel: { id: 1 } as Channel,
  } as unknown as RequestContext;

  it('routes to CustomerCreationService with existing user when phone belongs to an admin', async () => {
    const normalizedPhone = '0712345678';
    const adminUser = {
      id: 100,
      identifier: normalizedPhone,
      roles: [],
    } as unknown as User;
    const savedCustomer = {
      id: 'cust-1',
      firstName: 'Jane',
      lastName: 'Doe',
    } as Customer;

    mockCustomerLookupService.findCustomerByPhoneIncludingDeleted.mockResolvedValue(null as never);

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(adminUser as never),
    };

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return userRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });
    mockCustomerCreationService.create.mockResolvedValue(savedCustomer as never);

    const result = await resolver.createCustomerSafe(ctx, {
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: normalizedPhone,
    });

    expect(result).toBe(savedCustomer);
    expect(userRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ identifier: normalizedPhone, deletedAt: IsNull() }),
        relations: ['roles'],
      })
    );
    expect(mockCustomerCreationService.create).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: normalizedPhone,
      }),
      adminUser
    );
    expect(mockCustomerService.create).not.toHaveBeenCalled();
  });

  it('routes to CustomerCreationService without existing user when phone is new', async () => {
    const normalizedPhone = '0712345678';
    const createdCustomer = {
      id: 'cust-2',
      firstName: 'Jane',
      lastName: 'Doe',
    } as Customer;

    mockCustomerLookupService.findCustomerByPhoneIncludingDeleted.mockResolvedValue(null as never);

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(null as never),
    };

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return userRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });
    mockCustomerCreationService.create.mockResolvedValue(createdCustomer as never);

    const result = await resolver.createCustomerSafe(ctx, {
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: normalizedPhone,
    });

    expect(result).toBe(createdCustomer);
    expect(mockCustomerCreationService.create).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: normalizedPhone,
      })
    );
    expect(mockCustomerService.create).not.toHaveBeenCalled();
  });

  it('updates an existing customer and publishes an updated event', async () => {
    const normalizedPhone = '0712345678';
    const existingCustomer = {
      id: 'cust-3',
      firstName: 'Old',
      lastName: 'Name',
      emailAddress: 'old@example.com',
      phoneNumber: normalizedPhone,
      deletedAt: null,
    } as Customer;
    const updatedCustomer = {
      ...existingCustomer,
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
    } as Customer;

    mockCustomerLookupService.findCustomerByPhoneIncludingDeleted.mockResolvedValue(
      existingCustomer as never
    );

    const customerRepo = {
      save: jest.fn().mockResolvedValue(updatedCustomer as never),
    };

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    const result = await resolver.createCustomerSafe(ctx, {
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: normalizedPhone,
    });

    expect(result).toBe(updatedCustomer);
    expect(mockEventBus.publish).toHaveBeenCalled();
    const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as CustomerEvent;
    expect(event.type).toBe('updated');
  });
});
