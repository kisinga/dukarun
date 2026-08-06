import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ChangeChannelEvent,
  EventBus,
  RequestContext,
  StockLocation,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import { StoreProvisionerService } from '../../../src/services/auth/provisioning/store-provisioner.service';
import { RegistrationAuditorService } from '../../../src/services/auth/provisioning/registration-auditor.service';
import { RegistrationErrorService } from '../../../src/services/auth/provisioning/registration-error.service';
import * as entityRelationUtil from '../../../src/utils/entity-relation.util';

const buildService = () => {
  let relationManager: any;
  let channelRepo: any;
  let entityManager: any;

  relationManager = {
    of: jest.fn().mockReturnThis(),
    add: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const queryBuilder = {
    relation: jest.fn(() => relationManager),
  };

  channelRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn(async () => ({ id: '2' })),
    save: jest.fn(async (entity: any) => entity),
  };

  const connection = {
    getRepository: jest.fn((ctx: RequestContext, entity: any): any => {
      if (entity.name === 'Channel') {
        return channelRepo;
      }
      throw new Error(`Unexpected entity type: ${entity?.name || entity}`);
    }),
  } as unknown as TransactionalConnection;

  const stockLocationService = {
    create: jest.fn(async () => ({ id: '5', name: 'Primary Store' }) as StockLocation),
  };

  const eventBus = {
    publish: jest.fn(async () => undefined),
  } as unknown as EventBus;

  const auditor = {
    logEntityCreated: jest.fn(async () => undefined),
  } as unknown as RegistrationAuditorService;

  const errorService = {
    logError: jest.fn(),
    wrapError: jest.fn((error: any) => error),
    createError: jest.fn((code: string, message: string) => new Error(`${code}: ${message}`)),
  } as unknown as RegistrationErrorService;

  const service = new StoreProvisionerService(
    stockLocationService as unknown as StockLocationService,
    connection,
    eventBus,
    auditor,
    errorService
  );

  return {
    service,
    stockLocationService,
    connection,
    channelRepo,
    relationManager,
    queryBuilder,
    eventBus,
    auditor,
    errorService,
  };
};

describe('StoreProvisionerService', () => {
  const ctx = {} as RequestContext;
  const registrationData = {
    companyName: 'Test Company',
    // companyCode is NOT part of input - backend generates it from companyName
    currency: 'USD',
    adminFirstName: 'Jane',
    adminLastName: 'Doe',
    adminPhoneNumber: '0712345678',
    storeName: '  Primary Store  ',
    storeAddress: '123 Road',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock verifyEntityChannelAssignment to return true by default
    jest.spyOn(entityRelationUtil, 'verifyEntityChannelAssignment').mockResolvedValue(true);
  });

  describe('createAndAssignStore', () => {
    it('creates stock location with trimmed store name and assigns to channel using Hybrid Strategy', async () => {
      const harness = buildService();

      const result = await harness.service.createAndAssignStore(ctx, registrationData as any, '2');

      // 1. Verify service creation (Hybrid Strategy step 1)
      expect(harness.stockLocationService.create as jest.Mock<any>).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          name: 'Primary Store',
          description: '123 Road',
        })
      );

      // 2. Verify repository assignment (Hybrid Strategy step 2)
      expect(harness.connection.getRepository).toHaveBeenCalledWith(ctx, expect.anything());
      expect(harness.channelRepo.createQueryBuilder).toHaveBeenCalled();
      // IDs are normalized to numbers for database operations
      expect(harness.relationManager.of).toHaveBeenCalledWith(2);
      expect(harness.relationManager.add).toHaveBeenCalledWith(5);

      // 2b. Verify assignment was verified
      expect(entityRelationUtil.verifyEntityChannelAssignment).toHaveBeenCalledWith(
        harness.connection,
        ctx,
        '2',
        'stockLocations',
        '5'
      );

      // 3. Verify event publishing (Hybrid Strategy step 3)
      expect(harness.eventBus.publish).toHaveBeenCalled();
      const publishedEvent = (harness.eventBus.publish as jest.Mock).mock
        .calls[0][0] as ChangeChannelEvent<StockLocation>;
      expect(publishedEvent.entity).toEqual({ id: '5', name: 'Primary Store' });
      expect(publishedEvent.channelIds).toEqual(['2']);

      // 4. Verify audit logging
      expect(harness.auditor.logEntityCreated as jest.Mock<any>).toHaveBeenCalledWith(
        ctx,
        'StockLocation',
        '5',
        expect.objectContaining({ id: '5' }),
        expect.objectContaining({
          channelId: '2',
          storeName: '  Primary Store  ',
          storeAddress: '123 Road',
        })
      );

      expect(result).toEqual({ id: '5', name: 'Primary Store' });
    });

    it('throws when store name is missing', async () => {
      const harness = buildService();

      await expect(
        harness.service.createAndAssignStore(
          ctx,
          { ...registrationData, storeName: '   ' } as any,
          '2'
        )
      ).rejects.toThrow('Store name is required');
    });

    it('throws when store name is null', async () => {
      const harness = buildService();

      await expect(
        harness.service.createAndAssignStore(
          ctx,
          { ...registrationData, storeName: null } as any,
          '2'
        )
      ).rejects.toThrow('Store name is required');
    });

    it('handles empty store address gracefully', async () => {
      const harness = buildService();

      await harness.service.createAndAssignStore(
        ctx,
        { ...registrationData, storeAddress: '' } as any,
        '2'
      );

      expect(harness.stockLocationService.create as jest.Mock<any>).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          name: 'Primary Store',
          description: '',
        })
      );
    });

    it('handles service creation errors', async () => {
      const harness = buildService();
      const serviceError = new Error('Service creation failed');
      harness.stockLocationService.create.mockRejectedValueOnce(serviceError);

      await expect(
        harness.service.createAndAssignStore(ctx, registrationData as any, '2')
      ).rejects.toThrow();

      expect(harness.errorService.logError).toHaveBeenCalledWith(
        'StoreProvisioner',
        serviceError,
        'Store creation'
      );
      expect(harness.errorService.wrapError).toHaveBeenCalledWith(
        serviceError,
        'STOCK_LOCATION_CREATE_FAILED'
      );
    });

    it('handles service creation result with errorCode', async () => {
      const harness = buildService();
      harness.stockLocationService.create.mockResolvedValueOnce({
        errorCode: 'ERROR',
        message: 'Failed to create',
      } as any);

      await expect(
        harness.service.createAndAssignStore(ctx, registrationData as any, '2')
      ).rejects.toThrow('STOCK_LOCATION_CREATE_FAILED');
    });

    it('verifies assignment after assigning stock location to channel', async () => {
      const harness = buildService();

      await harness.service.createAndAssignStore(ctx, registrationData as any, '2');

      expect(entityRelationUtil.verifyEntityChannelAssignment).toHaveBeenCalledWith(
        harness.connection,
        ctx,
        '2',
        'stockLocations',
        '5'
      );
    });

    it('throws error when assignment verification fails', async () => {
      const harness = buildService();
      jest.spyOn(entityRelationUtil, 'verifyEntityChannelAssignment').mockResolvedValueOnce(false);

      await expect(
        harness.service.createAndAssignStore(ctx, registrationData as any, '2')
      ).rejects.toThrow('STOCK_LOCATION_ASSIGN_FAILED');

      expect(harness.errorService.createError).toHaveBeenCalledWith(
        'STOCK_LOCATION_ASSIGN_FAILED',
        expect.stringContaining('Assignment verification failed')
      );
    });

    it('handles assignment errors and wraps them', async () => {
      const harness = buildService();
      const assignmentError = new Error('Assignment failed');
      jest
        .spyOn(entityRelationUtil, 'assignEntityToChannel')
        .mockRejectedValueOnce(assignmentError);

      await expect(
        harness.service.createAndAssignStore(ctx, registrationData as any, '2')
      ).rejects.toThrow('STOCK_LOCATION_ASSIGN_FAILED');

      expect(harness.errorService.createError).toHaveBeenCalledWith(
        'STOCK_LOCATION_ASSIGN_FAILED',
        expect.stringContaining('Assignment failed')
      );
    });
  });
});
