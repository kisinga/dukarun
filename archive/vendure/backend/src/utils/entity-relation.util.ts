import { Channel, ID, RequestContext, TransactionalConnection } from '@vendure/core';

/**
 * Entity Relation Utilities
 *
 * Generic utilities for managing many-to-many relationships between entities.
 * Uses TypeORM relation manager (Vendure's internal pattern) for M2M assignments.
 *
 * These utilities provide a consistent, type-safe approach to channel-entity
 * relationship management throughout the application.
 */

/**
 * Assign an entity to a channel via many-to-many relationship.
 *
 * Uses TypeORM relation manager to directly update the join table, bypassing
 * permission checks that may fail during provisioning when permission cache
 * hasn't yet recognized access to newly created channels.
 *
 * @param connection - TransactionalConnection for repository access
 * @param ctx - RequestContext (should be within a transaction)
 * @param channelId - Channel ID to assign entity to
 * @param relationName - Name of the relation on Channel entity (e.g., 'stockLocations', 'paymentMethods')
 * @param entityId - ID of the entity to assign
 *
 * @example
 * ```typescript
 * await assignEntityToChannel(
 *   connection,
 *   ctx,
 *   channelId,
 *   'stockLocations',
 *   stockLocationId
 * );
 * ```
 */
export async function assignEntityToChannel(
  connection: TransactionalConnection,
  ctx: RequestContext,
  channelId: ID,
  relationName: string,
  entityId: ID
): Promise<void> {
  const channelRepo = connection.getRepository(ctx, Channel);

  // Normalize IDs to numbers for database operations
  // TypeORM's relation manager works best with numeric IDs for internal database operations
  const normalizedChannelId = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
  const normalizedEntityId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId;

  // Use relation manager to add the entity to channel
  const relationManager = channelRepo
    .createQueryBuilder()
    .relation(Channel, relationName)
    .of(normalizedChannelId);

  await relationManager.add(normalizedEntityId);

  // Relation manager changes are persisted when the transaction commits.
  // No need to save the channel entity - the join table is updated directly by the relation manager.
  // This matches the pattern used in channel-assignment.service.ts for payment methods.
}

/**
 * Verify that an entity is assigned to a channel.
 *
 * Loads the channel with the specified relation and checks if the entity
 * is present in the relation. Useful for verification after assignment
 * within a transaction.
 *
 * @param connection - TransactionalConnection for repository access
 * @param ctx - RequestContext (should be within a transaction)
 * @param channelId - Channel ID to check
 * @param relationName - Name of the relation on Channel entity
 * @param entityId - ID of the entity to verify
 * @returns true if entity is assigned, false otherwise
 *
 * @example
 * ```typescript
 * const isAssigned = await verifyEntityChannelAssignment(
 *   connection,
 *   ctx,
 *   channelId,
 *   'paymentMethods',
 *   paymentMethodId
 * );
 * ```
 */
export async function verifyEntityChannelAssignment(
  connection: TransactionalConnection,
  ctx: RequestContext,
  channelId: ID,
  relationName: string,
  entityId: ID
): Promise<boolean> {
  const channelRepo = connection.getRepository(ctx, Channel);
  const channel = await channelRepo.findOne({
    where: { id: channelId },
    relations: [relationName],
  });

  if (!channel) {
    return false;
  }

  const relation = (channel as any)[relationName];
  if (!relation || !Array.isArray(relation)) {
    return false;
  }

  // Normalize IDs for comparison - database may return numbers while input might be string
  const normalizedEntityId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId;
  return relation.some((item: any) => Number(item.id) === Number(normalizedEntityId));
}
