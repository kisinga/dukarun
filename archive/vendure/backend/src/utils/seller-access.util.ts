import { Channel, ID, RequestContext, Seller, TransactionalConnection } from '@vendure/core';

/**
 * Seller Access Utilities
 *
 * Utilities for working with sellers in the context of channels.
 * Provides helpers to get seller from channel and set seller on RequestContext.
 */

/**
 * Get seller for a channel
 * Channels have a seller property that links them to a seller entity
 *
 * @param ctx - RequestContext
 * @param channelId - Channel ID
 * @param connection - TransactionalConnection for repository access
 * @returns Seller or null if channel has no seller
 */
export async function getSellerForChannel(
  ctx: RequestContext,
  channelId: ID,
  connection: TransactionalConnection
): Promise<Seller | null> {
  // Load channel with seller relation
  const channelRepo = connection.getRepository(ctx, Channel);
  const channel = await channelRepo.findOne({
    where: { id: channelId },
    relations: ['seller'],
  });

  if (!channel) {
    return null;
  }

  return channel.seller || null;
}

/**
 * Execute a function with seller set on RequestContext.
 * Temporarily modifies context.seller, executes function, then restores original.
 * Preserves transaction access by using the same RequestContext object.
 *
 * @param ctx - RequestContext (may be in a transaction)
 * @param seller - Seller to set on context
 * @param fn - Function to execute with seller set on context
 * @returns Result of the function execution
 */
export async function withSeller<T>(
  ctx: RequestContext,
  seller: Seller | null,
  fn: (ctx: RequestContext) => Promise<T>
): Promise<T> {
  // Save original seller (if any)
  const originalSeller = (ctx as any).seller;

  try {
    // Set seller on context
    if (seller) {
      Object.defineProperty(ctx, 'seller', {
        value: seller,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    // Execute function with seller set on context
    return await fn(ctx);
  } finally {
    // Restore original seller (or remove if there wasn't one)
    if (originalSeller !== undefined) {
      Object.defineProperty(ctx, 'seller', {
        value: originalSeller,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      // Remove seller property if it didn't exist originally
      delete (ctx as any).seller;
    }
  }
}

/**
 * Execute a function with seller from channel set on RequestContext.
 * Gets seller for the channel, sets it on context, executes function, then restores original.
 *
 * @param ctx - RequestContext (may be in a transaction)
 * @param channelId - Channel ID to get seller from
 * @param connection - TransactionalConnection for repository access
 * @param fn - Function to execute with seller set on context
 * @returns Result of the function execution
 */
export async function withSellerFromChannel<T>(
  ctx: RequestContext,
  channelId: ID,
  connection: TransactionalConnection,
  fn: (ctx: RequestContext) => Promise<T>
): Promise<T> {
  // Get seller for channel
  const seller = await getSellerForChannel(ctx, channelId, connection);

  if (!seller) {
    throw new Error(`Channel ${channelId} has no seller associated`);
  }

  // Execute with seller set on context
  return await withSeller(ctx, seller, fn);
}
