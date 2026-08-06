/**
 * CustomerLifecycleService unit tests
 *
 * Ensures customers whose User is shared with an Administrator never have that
 * User rewritten (email updates) or soft-deleted (customer deletion), while
 * regular customers keep Vendure's stock behavior.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Administrator, Customer, RequestContext, User, UserInputError } from '@vendure/core';
import { CUSTOMER_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { CustomerLifecycleService } from '../../../src/services/customers/customer-lifecycle.service';

describe('CustomerLifecycleService', () => {
  let service: CustomerLifecycleService;

  const mockCustomerService = {
    update: jest.fn(),
    softDelete: jest.fn(),
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

  const ctx = { channelId: 1, channel: { id: 1 } } as unknown as RequestContext;

  const customerRole = { id: 10, code: CUSTOMER_ROLE_CODE, channels: [] };
  const adminRole = { id: 11, code: 'channel-1-admin', channels: [{ id: 1 }] };

  const makeCustomer = (roles: any[], userId = 100): Customer =>
    ({
      id: 'cust-1',
      firstName: 'Jane',
      lastName: 'Doe',
      emailAddress: 'customer.0712345678@pos.local',
      deletedAt: null,
      user: { id: userId, identifier: '0712345678', roles } as unknown as User,
    }) as unknown as Customer;

  /**
   * Wire the connection mock. `customer` is returned by the Customer repo
   * findOne; `activeAdmin` (default null) by the Administrator repo findOne.
   */
  const setupConnection = (customer: Customer | null, activeAdmin: Administrator | null = null) => {
    const customerRepo = {
      findOne: jest.fn().mockResolvedValue(customer as never),
      save: jest.fn().mockImplementation((c: any) => Promise.resolve(c)),
      update: jest.fn().mockResolvedValue(undefined as never),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null as never),
      }),
    };
    const adminRepo = {
      findOne: jest.fn().mockResolvedValue(activeAdmin as never),
    };
    mockConnection.getRepository.mockImplementation((_ctx: any, entity: any) => {
      if (entity === Customer) return customerRepo;
      if (entity === Administrator) return adminRepo;
      return { findOne: jest.fn(), save: jest.fn() };
    });
    return { customerRepo, adminRepo };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerLifecycleService(
      mockCustomerService as any,
      mockEventBus as any,
      mockConnection as any,
      mockCustomFieldRelationService as any,
      mockHistoryService as any
    );
  });

  describe('update', () => {
    it('delegates to Vendure CustomerService for customer-owned users', async () => {
      const customer = makeCustomer([customerRole]);
      setupConnection(customer);
      const updated = { ...customer, firstName: 'Janet' } as Customer;
      mockCustomerService.update.mockResolvedValue(updated as never);

      const result = await service.update(ctx, { id: 'cust-1', firstName: 'Janet' });

      expect(result).toBe(updated);
      expect(mockCustomerService.update).toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('maps Vendure error results to UserInputError for customer-owned users', async () => {
      const customer = makeCustomer([customerRole]);
      setupConnection(customer);
      mockCustomerService.update.mockResolvedValue({
        errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR',
        message: 'Email address already exists',
      } as never);

      await expect(service.update(ctx, { id: 'cust-1', firstName: 'Janet' })).rejects.toThrow(
        UserInputError
      );
    });

    it('updates shared-user customers directly without touching CustomerService.update', async () => {
      const customer = makeCustomer([customerRole, adminRole]);
      const { customerRepo } = setupConnection(customer);

      const result = await service.update(ctx, { id: 'cust-1', firstName: 'Janet' });

      expect(mockCustomerService.update).not.toHaveBeenCalled();
      expect(customerRepo.save).toHaveBeenCalled();
      const saved = (customerRepo.save as jest.Mock).mock.calls[0][0] as Customer;
      expect(saved.firstName).toBe('Janet');
      // The shared User must never be modified: no identifier rewrite happens
      // because CustomerService.update (which calls changeUserAndNativeIdentifier)
      // is bypassed entirely.
      expect(saved.user?.identifier).toBe('0712345678');
      expect(mockEventBus.publish).toHaveBeenCalled();
      const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as { type: string };
      expect(event.type).toBe('updated');
    });

    it('treats a user with only the customer role but an active Administrator as shared', async () => {
      const customer = makeCustomer([customerRole]);
      const activeAdmin = {
        id: '42',
        user: { id: 100 },
        deletedAt: null,
      } as unknown as Administrator;
      setupConnection(customer, activeAdmin);

      await service.update(ctx, { id: 'cust-1', firstName: 'Janet' });

      expect(mockCustomerService.update).not.toHaveBeenCalled();
    });

    it('rejects email changes that conflict with another customer in the channel', async () => {
      const customer = makeCustomer([customerRole, adminRole]);
      const { customerRepo } = setupConnection(customer);
      customerRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'other' } as never),
      });

      await expect(
        service.update(ctx, { id: 'cust-1', emailAddress: 'taken@example.com' })
      ).rejects.toThrow(UserInputError);
      expect(customerRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      setupConnection(null);
      await expect(service.update(ctx, { id: 'missing' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('delegates to Vendure softDelete for customer-owned users', async () => {
      const customer = makeCustomer([customerRole]);
      setupConnection(customer);
      mockCustomerService.softDelete.mockResolvedValue({ result: DeletionResult.DELETED } as never);

      const result = await service.delete(ctx, 'cust-1');

      expect(result.result).toBe(DeletionResult.DELETED);
      expect(mockCustomerService.softDelete).toHaveBeenCalledWith(ctx, 'cust-1');
    });

    it('soft-deletes only the Customer row for shared users', async () => {
      const customer = makeCustomer([customerRole, adminRole]);
      const { customerRepo } = setupConnection(customer);

      const result = await service.delete(ctx, 'cust-1');

      expect(result.result).toBe(DeletionResult.DELETED);
      // The shared User must survive: Vendure's softDelete (which soft-deletes
      // the User) is bypassed and only the Customer row is marked deleted.
      expect(mockCustomerService.softDelete).not.toHaveBeenCalled();
      expect(customerRepo.update).toHaveBeenCalledWith(
        { id: customer.id },
        expect.objectContaining({ deletedAt: expect.any(Date) })
      );
      expect(mockEventBus.publish).toHaveBeenCalled();
      const event = (mockEventBus.publish as jest.Mock).mock.calls[0][0] as { type: string };
      expect(event.type).toBe('deleted');
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      setupConnection(null);
      await expect(service.delete(ctx, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
