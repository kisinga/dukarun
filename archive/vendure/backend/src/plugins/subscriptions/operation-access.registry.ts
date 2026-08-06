import { SubscriptionAccessLevel } from './subscription-access.decorator';

type ApiScopedAccess = { admin?: SubscriptionAccessLevel; shop?: SubscriptionAccessLevel };
type RegistryEntry = SubscriptionAccessLevel | ApiScopedAccess;

/**
 * Explicit access levels for GraphQL operations that are not decorated with
 * `@SubscriptionAccess()` — typically Vendure built-ins and auth operations.
 *
 * Entries may be API-scoped (`{ admin?: ..., shop?: ... }`) or a plain level,
 * which applies to both APIs. Unknown mutations default to `write`; unknown
 * queries default to `read`.
 *
 * The registry also includes decorated public operations as a defensive fallback
 * so metadata and registry stay aligned.
 */
export const OPERATION_ACCESS_REGISTRY: Record<string, RegistryEntry> = {
  // --- Auth (shop + admin) --------------------------------------------------
  login: 'public',
  logout: 'public',
  requestRegistrationOTP: 'public',
  verifyRegistrationOTP: 'public',
  requestLoginOTP: 'public',
  verifyLoginOTP: 'public',

  // --- Billing / subscription recovery --------------------------------------
  initiateSubscriptionPurchase: 'public',
  verifySubscriptionPayment: 'public',
  cancelSubscription: 'public',

  // --- Subscription status queries ------------------------------------------
  checkSubscriptionStatus: 'public',
  getSubscriptionTiers: 'public',
  getChannelSubscription: 'public',

  // --- Admin bootstrap queries ------------------------------------------------
  // These must stay reachable while suspended so admins can authenticate and
  // navigate to renewal flows.
  activeAdministrator: 'public',
  me: 'public',
  activeChannel: 'public',

  // --- Public storefront identity -------------------------------------------
  // These are plain 'public' because the custom resolvers only exist in the Shop
  // API and must be reachable without any request context.
  storefront: 'public',
  publicStorefronts: 'public',

  // --- Storefront catalogue -------------------------------------------------
  // Admin users can still browse the catalog while the subscription is in
  // read-only mode, but customers cannot shop until the subscription is fully
  // active (`write` here means the same as `full`). The storefront resolver
  // controls visibility via `catalogueVisible`.
  search: { admin: 'read', shop: 'write' },
  product: { admin: 'read', shop: 'write' },
  products: { admin: 'read', shop: 'write' },
  collection: { admin: 'read', shop: 'write' },
  collections: { admin: 'read', shop: 'write' },
  facet: { admin: 'read', shop: 'write' },
  facets: { admin: 'read', shop: 'write' },

  // --- Public shop context queries ------------------------------------------
  eligiblePaymentMethods: { shop: 'public' },
  eligibleShippingMethods: { shop: 'public' },
};

/**
 * Resolve the required access level for a field, taking the API type into account.
 * Falls back to the plain entry value, then to `undefined` if there is no match.
 */
export function resolveRegistryAccessLevel(
  fieldName: string,
  apiType?: string
): SubscriptionAccessLevel | undefined {
  const entry = OPERATION_ACCESS_REGISTRY[fieldName];
  if (!entry) {
    return undefined;
  }
  if (typeof entry === 'string') {
    return entry;
  }
  if (apiType === 'admin' || apiType === 'shop') {
    return entry[apiType];
  }
  return undefined;
}
