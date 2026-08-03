import { Channel, RequestContext, TransactionalConnection, User, UserService } from '@vendure/core';
import { env } from '../infrastructure/config/environment.config';

/**
 * Request Context Utilities
 *
 * Utilities for working with RequestContexts that preserve transaction context.
 * These utilities ensure that system operations work correctly within transactions.
 */

/**
 * Execute a function with superadmin user in context.
 * Temporarily modifies context.user, executes function, then restores original.
 * Preserves transaction access by using the same RequestContext object.
 *
 * IMPORTANT: Audit logs within the wrapped function should explicitly use
 * source: 'system_event' or userId: null to avoid logging as superadmin actions.
 *
 * @param ctx - RequestContext (may be in a transaction)
 * @param userService - UserService to load superadmin user
 * @param connection - TransactionalConnection to load user with roles
 * @param fn - Function to execute with superadmin user in context
 * @returns Result of the function execution
 */
export async function withSuperadminUser<T>(
  ctx: RequestContext,
  userService: UserService,
  connection: TransactionalConnection,
  fn: (ctx: RequestContext) => Promise<T>
): Promise<T> {
  // Get superadmin user by identifier from config
  const superadminIdentifier = env.superadmin.username;
  if (!superadminIdentifier) {
    throw new Error('Superadmin username not configured');
  }

  // Create empty context for getting superadmin user
  const emptyCtxForUser = RequestContext.empty();

  // Get superadmin user
  const superadminUserBasic = await userService.getUserByEmailAddress(
    emptyCtxForUser,
    superadminIdentifier
  );

  if (!superadminUserBasic) {
    throw new Error(`Superadmin user not found: ${superadminIdentifier}`);
  }

  // Load user with roles relation - required for permission checks
  // Use the transaction context to ensure roles are loaded within the transaction
  const userRepo = connection.getRepository(ctx, User);
  const superadminUser = await userRepo.findOne({
    where: { id: superadminUserBasic.id },
    relations: ['roles', 'roles.channels'],
  });

  if (!superadminUser) {
    throw new Error(`Failed to load superadmin user with roles: ${superadminIdentifier}`);
  }

  // Save original private properties and user
  const originalApiType = (ctx as any)._apiType;
  const originalIsAuthorized = (ctx as any)._isAuthorized;
  const originalUser = (ctx as any).user;

  try {
    // Modify private backing fields directly to ensure getters return correct values
    // and to avoid issues with RequestContext.copy() which fails when copying properties
    // that shadow getters (like apiType)
    (ctx as any)._apiType = 'admin';
    (ctx as any)._isAuthorized = true;

    // Set superadmin user on context
    // 'user' is typically accessed via ctx.activeUserId or session, but some parts
    // might look for ctx.user directly if patched.
    (ctx as any).user = superadminUser;

    // Execute function with superadmin user in context
    return await fn(ctx);
  } finally {
    // Restore original values
    (ctx as any)._apiType = originalApiType;
    (ctx as any)._isAuthorized = originalIsAuthorized;

    if (originalUser !== undefined) {
      (ctx as any).user = originalUser;
    } else {
      // Remove user property if it didn't exist originally
      delete (ctx as any).user;
    }
  }
}

/**
 * Execute a function with channel set on context.
 * Temporarily modifies context.channel and context.channelId, executes function, then restores original.
 * Preserves transaction access by using the same RequestContext object.
 *
 * @param ctx - RequestContext (may be in a transaction)
 * @param channel - Channel to set on context
 * @param fn - Function to execute with channel set on context
 * @returns Result of the function execution
 */
export async function withChannel<T>(
  ctx: RequestContext,
  channel: Channel,
  fn: (ctx: RequestContext) => Promise<T>
): Promise<T> {
  // Save original private backing field
  const originalChannel = (ctx as any)._channel;

  try {
    // Modify private backing field
    // This updates ctx.channel (getter) and ctx.channelId (getter) automatically
    // and avoids shadowing getters with own properties which breaks RequestContext.copy()
    (ctx as any)._channel = channel;

    // Execute function with channel set on context
    return await fn(ctx);
  } finally {
    // Restore original value
    (ctx as any)._channel = originalChannel;
  }
}
