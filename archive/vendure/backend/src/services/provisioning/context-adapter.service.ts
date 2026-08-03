import { Injectable, Logger } from '@nestjs/common';
import {
  Administrator,
  Channel,
  ID,
  RequestContext,
  Role,
  Seller,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { withChannel } from '../../utils/request-context.util';
import { withSellerFromChannel } from '../../utils/seller-access.util';
import { IsNull } from 'typeorm';

/**
 * Provisioning Context Adapter
 *
 * Provides composable helpers for building seller-aware RequestContext during provisioning.
 * Ensures Vendure services receive properly configured contexts that pass permission checks.
 *
 * Key Features:
 * - Validates seller/channel/admin existence before operations
 * - Builds seller-scoped contexts for service calls
 * - Provides structured debug logging (feature-flag friendly)
 * - Ensures transactional consistency
 */
@Injectable()
export class ProvisioningContextAdapter {
  private readonly logger = new Logger(ProvisioningContextAdapter.name);

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Execute a function with seller-scoped RequestContext.
   * Gets seller from channel, validates existence, sets on context, then executes function.
   *
   * This is the primary method for calling Vendure services during provisioning.
   * It ensures that permission checks (e.g., getPermittedChannels()) can see the channel
   * by setting the channel's seller on the RequestContext.
   *
   * @param ctx - RequestContext (may be in a transaction)
   * @param channelId - Channel ID to get seller from
   * @param fn - Function to execute with seller-scoped context
   * @param options - Optional configuration
   * @returns Result of the function execution
   */
  async withSellerScope<T>(
    ctx: RequestContext,
    channelId: ID,
    fn: (ctx: RequestContext) => Promise<T>,
    options?: {
      enableDebugLogging?: boolean;
      operationName?: string;
    }
  ): Promise<T> {
    const enableDebug = options?.enableDebugLogging ?? false;
    const operationName = options?.operationName ?? 'operation';

    if (enableDebug) {
      this.logger.debug(
        `[${operationName}] Preparing seller-scoped context for channel ${channelId}`
      );
    }

    try {
      // Validate channel exists before proceeding and load it
      const channel = await this.loadChannelWithSeller(ctx, channelId, enableDebug);

      // Execute with both channel and seller set on context
      const result = await withChannel(ctx, channel, async ctxWithChannel => {
        return await withSellerFromChannel(
          ctxWithChannel,
          channelId,
          this.connection,
          async ctxWithSeller => {
            // Ensure user can access channel (loads user and adds channel to superadmin roles if needed)
            await this.ensureUserCanAccessChannel(ctxWithSeller, channelId, enableDebug);

            if (enableDebug) {
              const seller = (ctxWithSeller as any).seller as Seller | undefined;
              this.logger.debug(
                `[${operationName}] Context prepared: channel=${channelId}, seller=${seller?.id ?? 'none'}, user=${ctxWithSeller.activeUserId ?? 'none'}`
              );
            }

            return await fn(ctxWithSeller);
          }
        );
      });

      if (enableDebug) {
        this.logger.debug(`[${operationName}] Completed successfully for channel ${channelId}`);
      }

      return result;
    } catch (error: any) {
      this.logger.error(
        `[${operationName}] Failed for channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Load channel with seller relation.
   * Throws an error if channel is not found or has no seller.
   *
   * @param ctx - RequestContext
   * @param channelId - Channel ID to load
   * @param enableDebug - Enable debug logging
   * @returns Channel with seller relation
   */
  private async loadChannelWithSeller(
    ctx: RequestContext,
    channelId: ID,
    enableDebug = false
  ): Promise<Channel> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
      relations: ['seller'],
    });

    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    if (enableDebug) {
      this.logger.debug(`Channel ${channelId} loaded: seller=${channel.seller?.id ?? 'none'}`);
    }

    if (!channel.seller) {
      throw new Error(`Channel ${channelId} has no seller associated`);
    }

    return channel;
  }

  /**
   * Validate that a channel exists and is accessible.
   * Throws an error if channel is not found.
   *
   * @param ctx - RequestContext
   * @param channelId - Channel ID to validate
   * @param enableDebug - Enable debug logging
   */
  async validateChannelExists(
    ctx: RequestContext,
    channelId: ID,
    enableDebug = false
  ): Promise<void> {
    await this.loadChannelWithSeller(ctx, channelId, enableDebug);
  }

  /**
   * Validate that a seller exists.
   * Throws an error if seller is not found.
   *
   * @param ctx - RequestContext
   * @param sellerId - Seller ID to validate
   * @param enableDebug - Enable debug logging
   */
  async validateSellerExists(
    ctx: RequestContext,
    sellerId: ID,
    enableDebug = false
  ): Promise<Seller> {
    const sellerRepo = this.connection.getRepository(ctx, Seller);
    const seller = await sellerRepo.findOne({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new Error(`Seller ${sellerId} not found`);
    }

    if (enableDebug) {
      this.logger.debug(`Seller ${sellerId} validated: name=${seller.name}`);
    }

    return seller;
  }

  /**
   * Validate that an administrator exists.
   * Throws an error if administrator is not found.
   *
   * @param ctx - RequestContext
   * @param adminId - Administrator ID to validate
   * @param enableDebug - Enable debug logging
   */
  async validateAdministratorExists(
    ctx: RequestContext,
    adminId: ID,
    enableDebug = false
  ): Promise<Administrator> {
    const adminRepo = this.connection.getRepository(ctx, Administrator);
    const administrator = await adminRepo.findOne({
      where: { id: adminId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!administrator) {
      throw new Error(`Administrator ${adminId} not found`);
    }

    if (enableDebug) {
      this.logger.debug(
        `Administrator ${adminId} validated: email=${administrator.emailAddress}, user=${administrator.user?.id ?? 'none'}`
      );
    }

    return administrator;
  }

  /**
   * Ensure user can access channel by loading user and preparing context for permission checks.
   *
   * **Vendure Permission System Behavior:**
   * Vendure's `getPermittedChannels()` checks if a user's roles include the channel in their
   * `channels` array. Superadmin roles typically have empty `channels` arrays (global roles),
   * which causes permission checks to fail when working with specific channels.
   *
   * **Solution Approach:**
   * Following Vendure's pattern where superadmins have global access, we temporarily add
   * the channel to superadmin roles for the duration of this context. This is a context-scoped
   * modification that doesn't persist to the database, allowing permission checks to pass
   * while maintaining the principle that superadmins have access to all channels.
   *
   * **Alternative Considered:**
   * Using repository directly (bypassing permission checks) is used in `RoleProvisionerService`,
   * but for services that use `RoleService` or other Vendure services, we need permission checks
   * to pass. This approach ensures compatibility with Vendure's permission system.
   *
   * @param ctx - RequestContext with activeUserId
   * @param channelId - Channel ID to ensure access to
   * @param enableDebug - Enable debug logging
   */
  private async ensureUserCanAccessChannel(
    ctx: RequestContext,
    channelId: ID,
    enableDebug = false
  ): Promise<void> {
    if (!ctx.activeUserId) {
      // No user in context, skip
      return;
    }

    // Always load user with roles and channels relation to ensure we have latest data
    // This matches Vendure's pattern of loading user with relations for permission checks
    const userRepo = this.connection.getRepository(ctx, User);
    const user = await userRepo.findOne({
      where: { id: ctx.activeUserId },
      relations: ['roles', 'roles.channels'],
    });

    if (!user) {
      if (enableDebug) {
        this.logger.debug(`User ${ctx.activeUserId} not found, skipping channel access check`);
      }
      return;
    }

    // Check if user already has explicit channel access via roles
    const userHasExplicitAccess = user.roles.some((role: Role) =>
      role.channels?.some((ch: Channel) => ch.id === channelId)
    );

    if (userHasExplicitAccess) {
      // User already has explicit access, just set user on context without modification
      (ctx as any).user = user;
      if (enableDebug) {
        this.logger.debug(
          `User ${ctx.activeUserId} already has access to channel ${channelId} via existing roles`
        );
      }
      return;
    }

    // Load channel entity for context preparation
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      if (enableDebug) {
        this.logger.debug(`Channel ${channelId} not found, skipping channel access check`);
      }
      return;
    }

    // Identify superadmin roles (roles with no channel restrictions)
    // In Vendure, superadmin roles have empty channels arrays, indicating global access
    const superadminRoles = user.roles.filter(
      (role: Role) => !role.channels || role.channels.length === 0
    );

    if (superadminRoles.length > 0) {
      // For superadmin roles, temporarily add channel to enable permission checks
      // This is context-scoped and doesn't persist to the database
      // It allows Vendure's getPermittedChannels() to recognize superadmin access
      for (const role of superadminRoles) {
        // Initialize channels array if needed
        if (!role.channels) {
          (role as any).channels = [];
        }
        // Add channel if not already present (idempotent)
        if (!role.channels.some((ch: Channel) => ch.id === channelId)) {
          role.channels.push(channel);
        }
      }

      if (enableDebug) {
        this.logger.debug(
          `Prepared superadmin context: added channel ${channelId} to ${superadminRoles.length} role(s) for user ${ctx.activeUserId} (context-scoped, non-persistent)`
        );
      }
    }

    // Set user on context with prepared roles
    // This ensures permission checks can access the user and see channel access
    (ctx as any).user = user;
  }

  /**
   * Get structured context information for logging.
   * Useful for debugging permission failures and context issues.
   *
   * @param ctx - RequestContext to inspect
   * @returns Structured context information
   */
  getContextInfo(ctx: RequestContext): {
    channelId: ID | undefined;
    activeUserId: ID | undefined;
    sellerId: ID | undefined;
    apiType: string | undefined;
    isAuthorized: boolean;
  } {
    const seller = (ctx as any).seller as Seller | undefined;

    return {
      channelId: ctx.channelId,
      activeUserId: ctx.activeUserId,
      sellerId: seller?.id,
      apiType: ctx.apiType,
      isAuthorized: ctx.isAuthorized,
    };
  }
}
