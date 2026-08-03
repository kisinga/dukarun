import { Injectable } from '@angular/core';

/**
 * Holds the Vendure channel token for the resolved storefront. Set once the storefront is resolved
 * from the subdomain; the ApolloService reads it to scope every subsequent shop-api request to the
 * merchant's channel. Kept as a tiny standalone holder to avoid a circular dependency between
 * ApolloService and StorefrontStateService.
 */
@Injectable({ providedIn: 'root' })
export class ChannelTokenHolder {
  token: string | null = null;
}
