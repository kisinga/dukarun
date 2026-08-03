import { Injectable } from '@angular/core';
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApolloService {
  private readonly client: ApolloClient;

  constructor() {
    const httpLink = new HttpLink({
      uri: environment.apiUrl,
      fetchOptions: { credentials: 'include' },
    });
    this.client = new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
    });
  }

  getClient(): ApolloClient {
    return this.client;
  }
}
