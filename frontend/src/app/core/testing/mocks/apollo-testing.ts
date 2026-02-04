/**
 * Test Apollo client with MockLink. Default mocks cover GET_ACTIVE_CHANNEL and
 * GET_USER_CHANNELS so integration/behavior specs do not hit /admin-api.
 * Pass custom mocks to provideTestApolloClient(mocks) to override or extend.
 */

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { MockLink } from '@apollo/client/testing';
import { GET_ACTIVE_CHANNEL, GET_USER_CHANNELS } from '../../graphql/operations.graphql';
import { APOLLO_TEST_CLIENT } from '../../services/apollo-test-client.token';

export { APOLLO_TEST_CLIENT };

export interface MockResponse {
  request: { query: unknown; variables?: Record<string, unknown> };
  result: { data?: unknown; errors?: unknown[] };
}

const defaultMocks: MockResponse[] = [
  {
    request: { query: GET_ACTIVE_CHANNEL },
    result: { data: { activeChannel: null } },
  },
  {
    request: { query: GET_USER_CHANNELS },
    result: {
      data: {
        me: {
          id: '1',
          identifier: 'test',
          channels: [],
        },
      },
    },
  },
];

export function createTestApolloClient(mocks?: MockResponse[]): ApolloClient {
  const link = new MockLink((mocks ?? defaultMocks) as never);
  return new ApolloClient({
    link,
    cache: new InMemoryCache(),
  });
}

export function provideTestApolloClient(mocks?: MockResponse[]) {
  return {
    provide: APOLLO_TEST_CLIENT,
    useFactory: () => createTestApolloClient(mocks),
  };
}
