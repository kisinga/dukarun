import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Channel, ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
  assignEntityToChannel,
  verifyEntityChannelAssignment,
} from '../../src/utils/entity-relation.util';

describe('entity-relation.util', () => {
  let mockConnection: any;
  let mockCtx: RequestContext;
  let channelRepo: any;
  let relationManager: any;

  beforeEach(() => {
    relationManager = {
      of: jest.fn().mockReturnThis(),
      add: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const queryBuilder = {
      relation: jest.fn(() => relationManager),
    };

    channelRepo = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOne: jest.fn<() => Promise<Channel | null>>().mockResolvedValue({ id: '1' } as Channel),
      save: jest.fn<() => Promise<Channel>>().mockResolvedValue({ id: '1' } as Channel),
    };

    mockConnection = {
      getRepository: jest.fn((ctx: RequestContext, entity: any): any => {
        if (entity === Channel || (entity && entity.name === 'Channel')) {
          return channelRepo;
        }
        throw new Error(`Unexpected entity type: ${entity?.name || entity}`);
      }),
    } as unknown as TransactionalConnection;

    mockCtx = {} as RequestContext;
  });

  describe('assignEntityToChannel', () => {
    it('should assign entity to channel using TypeORM relation manager', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      await assignEntityToChannel(mockConnection, mockCtx, channelId, relationName, entityId);

      expect(mockConnection.getRepository).toHaveBeenCalledWith(mockCtx, Channel);
      expect(channelRepo.createQueryBuilder).toHaveBeenCalled();
      // IDs are normalized to numbers for database operations
      expect(relationManager.of).toHaveBeenCalledWith(1);
      expect(relationManager.add).toHaveBeenCalledWith(2);
    });

    it('should work with different relation names', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';

      await assignEntityToChannel(mockConnection, mockCtx, channelId, 'paymentMethods', entityId);

      // IDs are normalized to numbers for database operations
      expect(relationManager.of).toHaveBeenCalledWith(1);
      expect(relationManager.add).toHaveBeenCalledWith(2);
    });
  });

  describe('verifyEntityChannelAssignment', () => {
    it('should return true when entity is assigned to channel', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      const channel = {
        id: channelId,
        stockLocations: [{ id: entityId }, { id: '3' }],
      };

      channelRepo.findOne.mockResolvedValue(channel);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(true);
      expect(channelRepo.findOne).toHaveBeenCalledWith({
        where: { id: channelId },
        relations: [relationName],
      });
    });

    it('should return false when entity is not assigned to channel', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      const channel = {
        id: channelId,
        stockLocations: [{ id: '3' }, { id: '4' }],
      };

      channelRepo.findOne.mockResolvedValue(channel);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(false);
    });

    it('should return false when channel is not found', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      channelRepo.findOne.mockResolvedValue(null);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(false);
    });

    it('should return false when relation is not an array', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      const channel = {
        id: channelId,
        stockLocations: null,
      };

      channelRepo.findOne.mockResolvedValue(channel);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(false);
    });

    it('should return false when relation property does not exist', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      const channel = {
        id: channelId,
      };

      channelRepo.findOne.mockResolvedValue(channel);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(false);
    });

    it('should correctly identify entity by ID in relation array', async () => {
      const channelId: ID = '1';
      const entityId: ID = '2';
      const relationName = 'stockLocations';

      const channel = {
        id: channelId,
        stockLocations: [
          { id: '1', name: 'Location 1' },
          { id: entityId, name: 'Location 2' },
          { id: '3', name: 'Location 3' },
        ],
      };

      channelRepo.findOne.mockResolvedValue(channel);

      const result = await verifyEntityChannelAssignment(
        mockConnection,
        mockCtx,
        channelId,
        relationName,
        entityId
      );

      expect(result).toBe(true);
    });
  });
});
