/**
 * Frontend Testing Infrastructure
 *
 * Minimal, focused testing utilities.
 * Designed to be flexible and not break with refactoring.
 */

// Re-export commonly used testing utilities
export { signal } from '@angular/core';
export { ComponentFixture, TestBed } from '@angular/core/testing';

// Apollo test client: use provideTestApolloClient() in TestBed to avoid real GraphQL requests
export {
  APOLLO_TEST_CLIENT,
  createTestApolloClient,
  provideTestApolloClient,
  type MockResponse,
} from './mocks/apollo-testing';

// CompanyService mock: use createMockCompanyService() when testing components that need no GraphQL
export { createMockCompanyService } from './mocks/company-service.mock';
