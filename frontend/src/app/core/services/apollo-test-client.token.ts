import { InjectionToken } from '@angular/core';
import type { ApolloClient } from '@apollo/client';

/**
 * Optional test-only Apollo client. When provided (e.g. in TestBed), ApolloService
 * uses this instead of creating a real client. Production never provides it.
 */
export const APOLLO_TEST_CLIENT = new InjectionToken<ApolloClient>('APOLLO_TEST_CLIENT');
