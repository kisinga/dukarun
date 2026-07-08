import { SetMetadata } from '@nestjs/common';

export type SubscriptionAccessLevel = 'public' | 'read' | 'write';

export const SUBSCRIPTION_ACCESS_METADATA = 'subscription:access';

/**
 * Declares the subscription access level required by a GraphQL operation.
 *
 * - `public`: no subscription check (auth, billing recovery, public storefront).
 * - `read`:  requires a readable subscription (most queries).
 * - `write`: requires a writable subscription (mutations that change data).
 *
 * The global SubscriptionGuard uses this metadata together with the operation
 * registry to enforce access. If an operation has no metadata and is not in the
 * registry, mutations default to `write` and queries default to `read`.
 */
export const SubscriptionAccess = (level: SubscriptionAccessLevel): MethodDecorator =>
  SetMetadata(SUBSCRIPTION_ACCESS_METADATA, level);
