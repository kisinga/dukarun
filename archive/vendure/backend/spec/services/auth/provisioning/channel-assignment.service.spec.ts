import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Channel, RequestContext, StockLocation } from '@vendure/core';
import { ChannelAssignmentService } from '../../../../src/services/auth/provisioning/channel-assignment.service';

const buildService = () => {
  let channelRepo: any;
  let stockLocationRepo: any;

  const buildRepo = (entityName: string) => {
    const entities = new Map<any, any>();
    const relations = new Map<string, any[]>();

    return {
      findOne: jest.fn(async (options: any) => {
        const entityId = options.where.id;
        const entity = entities.get(entityId);
        if (!entity) return null;

        // Load relations if requested
        const entityWithRelations = { ...entity };
        if (options.relations) {
          for (const relation of options.relations) {
            const relationKey = `${entityId}-${relation}`;
            // If relation exists in map, use it; otherwise use entity's own relation property
            const savedRelation = relations.get(relationKey);
            // Always prefer savedRelation from map if it exists (even if empty array)
            // This ensures relations saved via save() are properly returned
            if (savedRelation !== undefined) {
              entityWithRelations[relation] = savedRelation;
            } else if (entity[relation] !== undefined) {
              entityWithRelations[relation] = entity[relation];
            } else {
              entityWithRelations[relation] = [];
            }
          }
        }

        return entityWithRelations;
      }),
      save: jest.fn(async (entity: any) => {
        const saved = { ...entity, id: entity.id || Date.now() };
        entities.set(saved.id, saved);

        // Save relations when entity is saved - always store even if empty array
        const stockLocationsKey = `${saved.id}-stockLocations`;
        if (saved.stockLocations !== undefined) {
          relations.set(stockLocationsKey, saved.stockLocations);
        }
        const channelsKey = `${saved.id}-channels`;
        if (saved.channels !== undefined) {
          relations.set(channelsKey, saved.channels);
        }
        const paymentMethodsKey = `${saved.id}-paymentMethods`;
        if (saved.paymentMethods !== undefined) {
          relations.set(paymentMethodsKey, saved.paymentMethods);
        }

        return saved;
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      _setEntity: (id: any, entity: any) => {
        entities.set(id, entity);
      },
      _setRelation: (entityId: any, relationName: string, relatedEntities: any[]) => {
        const key = `${entityId}-${relationName}`;
        relations.set(key, relatedEntities);
      },
      _getEntities: () => entities,
      _getRelations: () => relations,
    };
  };

  channelRepo = buildRepo('Channel');
  stockLocationRepo = buildRepo('StockLocation');

  const connection = {
    getRepository: jest.fn((ctx: RequestContext, entity: any) => {
      if (entity.name === 'Channel') {
        return channelRepo;
      }
      if (entity.name === 'StockLocation') {
        return stockLocationRepo;
      }
      return buildRepo(entity.name);
    }),
  };

  const channelService = {
    findOne: jest.fn(),
  };

  const stockLocationService = {
    findOne: jest.fn(),
  };

  const service = new ChannelAssignmentService(
    connection as any,
    channelService as any,
    stockLocationService as any
  );

  return {
    service,
    connection,
    channelRepo,
    stockLocationRepo,
  };
};

describe('ChannelAssignmentService', () => {
  const ctx = {} as RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Note: assignStockLocationToChannel was moved to StoreProvisionerService
  // Tests for stock location assignment should be in store-provisioner.service.spec.ts

  it('should be instantiated', () => {
    const { service } = buildService();
    expect(service).toBeDefined();
  });
});
