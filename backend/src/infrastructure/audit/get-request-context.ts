import { ExecutionContext, Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestContext } from '@vendure/core';

/**
 * The key under which Vendure stores the RequestContext on the Express request.
 * This mirrors the internal constant from @vendure/core/dist/common/constants.
 * See: node_modules/@vendure/core/dist/common/constants.js
 */
const REQUEST_CONTEXT_KEY = 'vendureRequestContext';
const REQUEST_CONTEXT_MAP_KEY = 'vendureRequestContextMap';

const logger = new Logger('getVendureRequestContext');

interface RequestContextStore {
  default: RequestContext;
  withTransactionManager?: RequestContext;
}

/**
 * Extracts the Vendure RequestContext from a NestJS ExecutionContext.
 *
 * Vendure's AuthGuard creates the RequestContext and stores it on the Express
 * `req` object under a well-known key (`vendureRequestContext`). The common
 * pattern `gqlContext.getContext().req as RequestContext` is INCORRECT — that
 * gives you the Express Request object, not the RequestContext.
 *
 * This helper mirrors the logic of Vendure's internal `internal_getRequestContext`
 * to properly retrieve the RequestContext.
 *
 * IMPORTANT: This function always returns the **non-transactional** (`default`)
 * RequestContext. The `withTransactionManager` variant is bound to a specific
 * resolver's transaction and its query runner may already be released by the time
 * guards/interceptors run. Guards and interceptors should never use a
 * transaction-scoped context — they need a clean context for independent DB queries.
 *
 * Returns `null` if no RequestContext can be found (should not happen for
 * authenticated admin API calls).
 */
export function getVendureRequestContext(context: ExecutionContext): RequestContext | null {
  try {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req;

    if (!req) {
      logger.debug('No req object found on GQL context');
      return null;
    }

    // Try handler-specific RequestContext first (more specific)
    if (typeof context.getHandler === 'function') {
      const map = req[REQUEST_CONTEXT_MAP_KEY] as Map<Function, RequestContextStore> | undefined;
      if (map) {
        const item = map.get(context.getHandler());
        if (item) {
          // Always use `default` — never the transactional variant.
          // The transactional context's query runner may already be released.
          return item.default;
        }
      }
    }

    // Fall back to the shared RequestContext (set by Vendure's AuthGuard)
    const store = req[REQUEST_CONTEXT_KEY] as RequestContextStore | undefined;
    if (store) {
      return store.default;
    }

    // Last resort: maybe `req` IS the RequestContext (legacy/unusual setup)
    if (req instanceof RequestContext) {
      return req;
    }

    // Check if req has channelId (duck-typing for RequestContext)
    if (typeof req.channelId !== 'undefined' && typeof req.channel !== 'undefined') {
      return req as unknown as RequestContext;
    }

    logger.debug('Could not find RequestContext on Express request object');
    return null;
  } catch (error) {
    logger.debug(
      `Error extracting RequestContext: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
