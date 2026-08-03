import {
  Channel,
  ChannelService,
  ID,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';

/**
 * Channel Access Utilities
 *
 * Single place for loading a channel by ID when the request may not have seller
 * association. Use findChannelById with bypassSellerFilter=true when the caller
 * is a guard, auth flow, or other context where ChannelService.findOne would
 * fail due to seller filtering (e.g. CHANNEL_NOT_FOUND despite valid channelId).
 * For normal request flows with seller set, use bypassSellerFilter=false or
 * ChannelService directly.
 */

/**
 * Find channel by ID, optionally bypassing seller filtering.
 *
 * When bypassSellerFilter is true, uses the Channel repository directly so that
 * channels can be loaded when RequestContext has no seller (e.g. in guards or
 * phone-auth flows). This is the only sanctioned way to "find channel by id when
 * no seller"; do not add ad-hoc getRepository(ctx, Channel).findOne elsewhere for
 * the same purpose.
 *
 * @param ctx - RequestContext
 * @param channelId - Channel ID to find
 * @param connection - TransactionalConnection for repository access
 * @param channelService - ChannelService (for normal access with seller filtering)
 * @param bypassSellerFilter - If true, use repository to bypass seller filtering
 * @returns Channel or null if not found
 */
export async function findChannelById(
  ctx: RequestContext,
  channelId: ID,
  connection: TransactionalConnection,
  channelService: ChannelService,
  bypassSellerFilter = false
): Promise<Channel | null> {
  if (bypassSellerFilter) {
    // Use repository directly to bypass seller filtering
    // This is needed when RequestContext doesn't have seller association
    // but we still need to access the channel (e.g., in guards, auth flows)
    const channelRepo = connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });
    return channel ?? null; // Convert undefined to null
  } else {
    // Use ChannelService for normal access with seller filtering
    const channel = await channelService.findOne(ctx, channelId);
    return channel ?? null; // Convert undefined to null if needed
  }
}
