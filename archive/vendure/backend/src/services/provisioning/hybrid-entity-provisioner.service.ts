import { Injectable } from '@nestjs/common';
import {
  ChangeChannelEvent,
  Channel,
  ChannelAware,
  EventBus,
  ID,
  RequestContext,
  TransactionalConnection,
  VendureEntity,
} from '@vendure/core';
import { assignEntityToChannel } from '../../utils/entity-relation.util';

/**
 * Hybrid Entity Provisioner Service
 *
 * Base abstract class for provisioning entities that require:
 * 1. Service-based creation (validation, defaults, events)
 * 2. Repository-based M2M assignment (bypass permission cache)
 * 3. Event publishing (ChangeChannelEvent)
 *
 * This pattern is used when:
 * - Entity has a Vendure service for creation
 * - Entity needs M2M assignment to channel
 * - Permission cache may not reflect new channel access during provisioning
 *
 * **Usage Example**:
 * ```typescript
 * @Injectable()
 * export class StockLocationProvisioner extends HybridEntityProvisionerService<StockLocation, CreateStockLocationInput> {
 *   constructor(
 *     connection: TransactionalConnection,
 *     eventBus: EventBus,
 *     private readonly stockLocationService: StockLocationService
 *   ) {
 *     super(connection, eventBus);
 *   }
 *
 *   protected async createEntity(ctx: RequestContext, input: CreateStockLocationInput): Promise<StockLocation> {
 *     return await this.stockLocationService.create(ctx, input);
 *   }
 *
 *   protected getChannelRelationName(): string {
 *     return 'stockLocations';
 *   }
 *
 *   protected getEntityType(): typeof StockLocation {
 *     return StockLocation;
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class HybridEntityProvisionerService<
  TEntity extends VendureEntity & ChannelAware,
  TCreateInput,
> {
  constructor(
    protected readonly connection: TransactionalConnection,
    protected readonly eventBus: EventBus
  ) {}

  /**
   * Create entity using Vendure service.
   * Implementations should use the appropriate Vendure service (e.g., StockLocationService.create).
   */
  protected abstract createEntity(ctx: RequestContext, input: TCreateInput): Promise<TEntity>;

  /**
   * Get the relation name on Channel entity for this entity type.
   * Examples: 'stockLocations', 'paymentMethods', 'assets'
   */
  protected abstract getChannelRelationName(): string;

  /**
   * Get the entity type/class for event publishing.
   * Used in ChangeChannelEvent constructor.
   */
  protected abstract getEntityType(): new () => VendureEntity & ChannelAware;

  /**
   * Hybrid provision: Create via service, assign via repository, publish event.
   *
   * This is the main method that orchestrates the Hybrid Strategy:
   * 1. Creates entity using Vendure service (ensures validation, defaults, events)
   * 2. Assigns to channel via repository (bypasses permission cache issues)
   * 3. Publishes ChangeChannelEvent (ensures subscribers are notified)
   *
   * @param ctx - RequestContext (should be within a transaction)
   * @param input - Input for entity creation
   * @param channelId - Channel ID to assign entity to
   * @returns Created and assigned entity
   */
  async provision(ctx: RequestContext, input: TCreateInput, channelId: ID): Promise<TEntity> {
    // 1. Create via service (validation, defaults, events)
    const entity = await this.createEntity(ctx, input);

    // 2. Assign via repository (bypass permission check)
    await this.assignToChannel(ctx, channelId, entity.id);

    // 3. Publish event (ensure subscribers are notified)
    await this.publishChangeChannelEvent(ctx, entity, channelId);

    return entity;
  }

  /**
   * Assign entity to channel using TypeORM relation manager.
   * Uses the generic utility function for consistency.
   */
  private async assignToChannel(ctx: RequestContext, channelId: ID, entityId: ID): Promise<void> {
    await assignEntityToChannel(
      this.connection,
      ctx,
      channelId,
      this.getChannelRelationName(),
      entityId
    );
  }

  /**
   * Publish ChangeChannelEvent to notify subscribers (indexers, etc.).
   * This ensures the event-driven architecture remains consistent.
   */
  private async publishChangeChannelEvent(
    ctx: RequestContext,
    entity: TEntity,
    channelId: ID
  ): Promise<void> {
    await this.eventBus.publish(
      new ChangeChannelEvent(ctx, entity, [channelId], 'assigned', this.getEntityType())
    );
  }
}
