import { RequestContext } from '@vendure/core';
import {
  evaluateSubscriptionAccess,
  SubscriptionAccessDecision,
} from '../../services/subscriptions/subscription-access.policy';

/**
 * Per-request cache for evaluated subscription access.
 *
 * `RequestContext` is request-scoped, so a WeakMap keyed by the context gives us
 * exactly-once evaluation per channel per request without leaking memory.
 *
 * Tests that exercise multiple subscription states should create a fresh
 * `RequestContext` object for each scenario rather than reusing the same instance.
 */
const accessCache = new WeakMap<RequestContext, Map<string, SubscriptionAccessDecision>>();

/**
 * Get the evaluated subscription access for a channel within the current request.
 * Results are cached on the RequestContext so subsequent lookups are free.
 */
export function getSubscriptionAccess(
  ctx: RequestContext,
  channelId: string,
  customFields: Record<string, unknown>
): SubscriptionAccessDecision {
  let channelMap = accessCache.get(ctx);
  if (!channelMap) {
    channelMap = new Map();
    accessCache.set(ctx, channelMap);
  }

  if (!channelMap.has(channelId)) {
    channelMap.set(channelId, evaluateSubscriptionAccess(customFields));
  }

  return channelMap.get(channelId)!;
}

/**
 * Clear cached access for a channel. Used after a state transition (e.g. expiry,
 * renewal) so the next lookup sees the updated fields.
 */
export function clearSubscriptionAccess(ctx: RequestContext, channelId?: string): void {
  const channelMap = accessCache.get(ctx);
  if (!channelMap) return;
  if (channelId) {
    channelMap.delete(channelId);
  } else {
    channelMap.clear();
  }
}
