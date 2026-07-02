import { Injectable, inject } from '@angular/core';
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';

import { environment } from '../../../environments/environment';
import { ChannelTokenHolder } from './channel-token.holder';

/**
 * Anonymous shop-api Apollo client. A middleware link injects the resolved `vendure-token` so every
 * request after storefront resolution is scoped to the merchant's channel. The initial
 * `storefront(slug)` query runs with no token (channel-agnostic on the backend).
 */
@Injectable({ providedIn: 'root' })
export class ApolloService {
  private readonly tokenHolder = inject(ChannelTokenHolder);
  private readonly client: ApolloClient;

  constructor() {
    const httpLink = new HttpLink({ uri: environment.apiUrl });

    const tokenLink = new ApolloLink((operation, forward) => {
      const token = this.tokenHolder.token;
      if (token) {
        operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
          headers: { ...headers, 'vendure-token': token },
        }));
      }
      return forward(operation);
    });

    this.client = new ApolloClient({
      link: ApolloLink.from([tokenLink, httpLink]),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: { fetchPolicy: 'cache-first' },
      },
    });
  }

  getClient(): ApolloClient {
    return this.client;
  }
}
