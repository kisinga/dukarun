/**
 * CustomerCreationService tests
 *
 * Ensures the admin-as-customer path creates a Customer for an existing User,
 * assigns the customer role, and publishes the expected Vendure events.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Channel,
  Customer,
  CustomerEvent,
  CustomerService,
  EventBus,
  RequestContext,
  Role,
  RoleService,
  User,
} from '@vendure/core';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import { CustomerCreationService } from '../../../src/services/customers/customer-creation.service';

describe('CustomerCreationService', () => {
  let service: CustomerCreationService;

  const mockCustomerService = {
    create: jest.fn(),
  };

  const customerRole = { id: 999, code: 'customer' } as Role;
  const mockRoleService = {
    getCustomerRole: jest.fn().mockResolvedValue(customerRole as never),
  };

  const mockEventBus = {
    publish: jest.fn().mockResolvedValue(undefined as never),
  };

  const mockConnection: any = {
    getRepository: jest.fn(),
  };

  const mockCustomFieldRelationService = {
    updateRelations: jest.fn().mockResolvedValue(undefined as never),
  };

  const mockHistoryService = {
    createHistoryEntryForCustomer: jest.fn().mockResolvedValue(undefined as never),
  };

  const makeUserRepo = (relationAdd: jest.Mock) => ({
    createQueryBuilder: jest.fn().mockReturnValue({
      relation: jest.fn().mockReturnValue({
        of: jest.fn().mockReturnValue({
          add: relationAdd,
        }),
      }),
    }),
  });

  const makeCustomerRepo = (saveResult: Customer) => ({
    findOne: jest.fn().mockResolvedValue(null as never),
    save: jest.fn().mockResolvedValue(saveResult as never),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null as never),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerCreationService(
      mockCustomerService as unknown as CustomerService,
      mockRoleService as unknown as RoleService,
      mockEventBus as unknown as EventBus,
      mockConnection as any,
      mockCustomFieldRelationService as any,
      mockHistoryService as any
    );
  });

  const ctx = {
    channelId: 1,
    channel: { id: 1 } as Channel,
  } as unknown as RequestContext;

  it('creates a Customer for an existing User and adds the customer role', async () => {
    const adminUser = {
      id: 100,
      identifier: '0712345678',
      verified: true,
      roles: [{ id: 1, code: 'channel-1-admin' } as Role],
    } as User;
    const savedCustomer = {
      id: 'cust-1',
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: '0712345678',
      user: adminUser,
    } as Customer;

    const relationAdd = jest.fn().mockResolvedValue(undefined as never);
    const customerRepo = makeCustomerRepo(savedCustomer);

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return makeUserRepo(relationAdd);
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    const result = await service.create(
      ctx,
      {
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: '0712345678',
      },
      adminUser
    );

    expect(result).toBe(savedCustomer);
    expect(relationAdd).toHaveBeenCalledWith(customerRole.id);
    expect(customerRepo.save).toHaveBeenCalled();
    const saved = (customerRepo.save as jest.Mock).mock.calls[0][0] as Customer;
    expect(saved.user).toBe(adminUser);
    expect(saved.channels).toEqual([ctx.channel]);
    expect(mockEventBus.publish).toHaveBeenCalled();
    const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as CustomerEvent;
    expect(event.type).toBe('created');
    expect(event.entity).toBe(savedCustomer);
    expect(mockCustomFieldRelationService.updateRelations).toHaveBeenCalledWith(
      ctx,
      Customer,
      expect.objectContaining({ emailAddress: 'customer.0712345678@pos.local' }),
      savedCustomer
    );
    expect(mockHistoryService.createHistoryEntryForCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx,
        customerId: savedCustomer.id,
        type: HistoryEntryType.CUSTOMER_REGISTERED,
      })
    );
    expect(mockHistoryService.createHistoryEntryForCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx,
        customerId: savedCustomer.id,
        type: HistoryEntryType.CUSTOMER_VERIFIED,
      })
    );
  });

  it('does not re-add the customer role when the User already has it', async () => {
    const adminUser = {
      id: 100,
      identifier: '0712345678',
      roles: [customerRole],
    } as User;
    const savedCustomer = {
      id: 'cust-1',
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: '0712345678',
      user: adminUser,
    } as Customer;

    const relationAdd = jest.fn().mockResolvedValue(undefined as never);
    const customerRepo = makeCustomerRepo(savedCustomer);

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return makeUserRepo(relationAdd);
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    await service.create(
      ctx,
      {
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: '0712345678',
      },
      adminUser
    );

    expect(relationAdd).not.toHaveBeenCalled();
    expect(mockCustomFieldRelationService.updateRelations).toHaveBeenCalled();
    expect(mockHistoryService.createHistoryEntryForCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ type: HistoryEntryType.CUSTOMER_REGISTERED })
    );
    expect(mockHistoryService.createHistoryEntryForCustomer).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: HistoryEntryType.CUSTOMER_VERIFIED })
    );
  });

  it('delegates to Vendure CustomerService.create when no existing User is supplied', async () => {
    const createdCustomer = {
      id: 'cust-2',
      firstName: 'Jane',
      lastName: 'Doe',
    } as Customer;

    mockCustomerService.create.mockResolvedValue(createdCustomer as never);

    const result = await service.create(ctx, {
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: '0712345678',
    });

    expect(result).toBe(createdCustomer);
    expect(mockCustomerService.create).toHaveBeenCalledWith(ctx, {
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: '0712345678',
    });
    expect(mockEventBus.publish).not.toHaveBeenCalled();
    expect(mockCustomFieldRelationService.updateRelations).not.toHaveBeenCalled();
    expect(mockHistoryService.createHistoryEntryForCustomer).not.toHaveBeenCalled();
  });

  it('throws when Vendure CustomerService.create returns an error result', async () => {
    mockCustomerService.create.mockResolvedValue({
      errorCode: 'EmailAddressConflictError',
      message: 'Email address already exists',
    } as never);

    await expect(
      service.create(ctx, {
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: '0712345678',
      })
    ).rejects.toThrow('Email address already exists');
  });

  it('throws when an active customer with the same email already exists in the channel', async () => {
    const adminUser = {
      id: 100,
      identifier: '0712345678',
      roles: [{ id: 1, code: 'channel-1-admin' } as Role],
    } as User;
    const existingInChannel = {
      id: 'cust-existing',
      emailAddress: 'customer.0712345678@pos.local',
    } as unknown as Customer;

    const relationAdd = jest.fn().mockResolvedValue(undefined as never);
    const customerRepo = makeCustomerRepo({} as Customer);
    customerRepo.createQueryBuilder = jest.fn().mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(existingInChannel as never),
    });

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return makeUserRepo(relationAdd);
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    await expect(
      service.create(
        ctx,
        {
          firstName: 'Jane',
          lastName: 'Doe',
          emailAddress: 'customer.0712345678@pos.local',
          phoneNumber: '0712345678',
        },
        adminUser
      )
    ).rejects.toThrow('Email address already exists');
  });

  it('throws when the same email belongs to an active customer of a different user', async () => {
    const adminUser = {
      id: 100,
      identifier: '0712345678',
      roles: [{ id: 1, code: 'channel-1-admin' } as Role],
    } as User;
    const existingCustomer = {
      id: 'cust-other-user',
      emailAddress: 'customer.0712345678@pos.local',
      user: { id: 999 },
      channels: [],
    } as unknown as Customer;

    const relationAdd = jest.fn().mockResolvedValue(undefined as never);
    const customerRepo = makeCustomerRepo({} as Customer);
    customerRepo.findOne = jest.fn().mockResolvedValue(existingCustomer as never);

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return makeUserRepo(relationAdd);
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    await expect(
      service.create(
        ctx,
        {
          firstName: 'Jane',
          lastName: 'Doe',
          emailAddress: 'customer.0712345678@pos.local',
          phoneNumber: '0712345678',
        },
        adminUser
      )
    ).rejects.toThrow('Email address already exists');
  });

  it('adds the current channel to an existing customer of the same user instead of duplicating', async () => {
    const adminUser = {
      id: 100,
      identifier: '0712345678',
      roles: [{ id: 1, code: 'channel-1-admin' } as Role],
    } as User;
    const existingCustomer = {
      id: 'cust-same-user',
      firstName: 'Old',
      lastName: 'Name',
      emailAddress: 'customer.0712345678@pos.local',
      phoneNumber: '0711111111',
      user: adminUser,
      channels: [] as Channel[],
      customFields: { existing: true },
    } as unknown as Customer;
    const updatedCustomer = {
      ...existingCustomer,
      firstName: 'Jane',
      lastName: 'Doe',
      channels: [ctx.channel],
    } as Customer;

    const relationAdd = jest.fn().mockResolvedValue(undefined as never);
    const customerRepo = makeCustomerRepo(updatedCustomer);
    customerRepo.findOne = jest.fn().mockResolvedValue(existingCustomer as never);

    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === User) return makeUserRepo(relationAdd);
      if (entity === Customer) return customerRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });

    const result = await service.create(
      ctx,
      {
        firstName: 'Jane',
        lastName: 'Doe',
        emailAddress: 'customer.0712345678@pos.local',
        phoneNumber: '0712345678',
        customFields: { new: true },
      },
      adminUser
    );

    expect(result).toBe(updatedCustomer);
    expect(relationAdd).not.toHaveBeenCalled();
    expect(customerRepo.save).toHaveBeenCalled();
    const saved = (customerRepo.save as jest.Mock).mock.calls[0][0] as Customer;
    expect(saved.channels).toEqual([ctx.channel]);
    expect(saved.customFields).toEqual({ existing: true, new: true });

    const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as CustomerEvent;
    expect(event.type).toBe('updated');
    expect(event.entity).toBe(updatedCustomer);
    expect(mockCustomFieldRelationService.updateRelations).toHaveBeenCalledWith(
      ctx,
      Customer,
      expect.objectContaining({ emailAddress: 'customer.0712345678@pos.local' }),
      updatedCustomer
    );
    expect(mockHistoryService.createHistoryEntryForCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx,
        customerId: updatedCustomer.id,
        type: HistoryEntryType.CUSTOMER_DETAIL_UPDATED,
      })
    );
  });
});
