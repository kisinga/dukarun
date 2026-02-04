/**
 * Test Apollo client with MockLink. Default mocks cover GET_ACTIVE_CHANNEL,
 * GET_USER_CHANNELS, and GET_ACTIVE_ADMIN so integration/behavior specs do not
 * hit /admin-api. Pass custom mocks to provideTestApolloClient(mocks) to override or extend.
 */

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { MockLink } from '@apollo/client/testing';
import {
  GET_ACTIVE_ADMIN,
  GET_ACTIVE_CHANNEL,
  GET_USER_CHANNELS,
} from '../../graphql/operations.graphql';
import { APOLLO_TEST_CLIENT } from '../../services/apollo-test-client.token';

export { APOLLO_TEST_CLIENT };

export interface MockResponse {
  request: { query: unknown; variables?: Record<string, unknown> };
  result: { data?: unknown; errors?: unknown[] };
  /** Allow this mock to be used multiple times (default 1). Use a high number for queries called repeatedly (e.g. by CompanyService/AuthSessionService). */
  maxUsageCount?: number;
}

/** High reuse count so GetActiveChannel / GetUserChannels / GetActiveAdministrator can be called many times across tests. */
const MOCK_REUSE_COUNT = 100;

const defaultMocks: MockResponse[] = [
  {
    request: { query: GET_ACTIVE_CHANNEL },
    result: { data: { activeChannel: null } },
    maxUsageCount: MOCK_REUSE_COUNT,
  },
  {
    request: { query: GET_USER_CHANNELS },
    result: {
      data: {
        me: {
          id: '1',
          identifier: 'test',
          channels: [
            {
              id: 'channel-1',
              code: 'company-1',
              token: 'token-1',
              __typename: 'CurrentUserChannel',
            },
            {
              id: 'channel-2',
              code: 'company-2',
              token: 'token-2',
              __typename: 'CurrentUserChannel',
            },
          ],
          __typename: 'CurrentUser',
        },
      },
    },
    maxUsageCount: MOCK_REUSE_COUNT,
  },
  {
    request: { query: GET_ACTIVE_ADMIN },
    result: {
      data: {
        activeAdministrator: {
          id: '1',
          firstName: 'Test',
          lastName: 'Admin',
          emailAddress: 'test@test.local',
          user: {
            id: '1',
            identifier: 'test',
            roles: [{ id: '1', code: 'SuperAdmin', permissions: [], __typename: 'Role' }],
            __typename: 'User',
          },
          customFields: { profilePicture: null, __typename: 'AdministratorCustomFields' },
          __typename: 'Administrator',
        },
      },
    },
    maxUsageCount: MOCK_REUSE_COUNT,
  },
];

/**
 * Builds the full mocks array: custom mocks first (so they override defaults for the same query), then defaults so GET_ACTIVE_CHANNEL / GET_USER_CHANNELS / GET_ACTIVE_ADMIN are always available with reuse.
 */
function buildMocks(customMocks?: MockResponse[]): MockResponse[] {
  return customMocks ? [...customMocks, ...defaultMocks] : defaultMocks;
}

export function createTestApolloClient(mocks?: MockResponse[]): ApolloClient {
  const link = new MockLink(buildMocks(mocks) as never);
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
