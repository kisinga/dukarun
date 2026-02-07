/**
 * Service Behavior Tests
 *
 * Tests core service behavior without being overly specific about implementation.
 * Focuses on real-world scenarios that could break in production.
 * Designed to be flexible and not break with refactoring.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { provideTestApolloClient } from '../../testing/mocks/apollo-testing';
import { ApolloService } from '../apollo.service';
import { AuthService } from '../auth.service';
import { CompanyService } from '../company.service';

describe('Service Behavior Tests', () => {
  let authService: AuthService;
  let companyService: CompanyService;
  let apolloService: ApolloService;

  beforeEach(() => {
    const mockSwPush = {
      isEnabled: false,
      messages: { subscribe: () => ({ unsubscribe: () => {} }) },
      notificationClicks: { subscribe: () => ({ unsubscribe: () => {} }) },
      subscription: { toPromise: () => Promise.resolve(null) },
      requestSubscription: () => Promise.reject(new Error('Not enabled in tests')),
      unsubscribe: () => Promise.resolve(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestApolloClient(),
        AuthService,
        CompanyService,
        ApolloService,
        { provide: SwPush, useValue: mockSwPush },
      ],
    });

    authService = TestBed.inject(AuthService);
    companyService = TestBed.inject(CompanyService);
    apolloService = TestBed.inject(ApolloService);

    // Set up test companies data
    const testCompanies = [
      { id: 'company-1', code: 'COMP1', name: 'Test Company 1', token: 'token1' },
      { id: 'company-2', code: 'COMP2', name: 'Test Company 2', token: 'token2' },
    ];

    // Use reflection to set private companies signal
    (companyService as any).companiesSignal.set(testCompanies);
  });

  describe('Core Service Functionality', () => {
    it('should provide authentication services', () => {
      // Test: Auth service should provide core functionality
      expect(typeof authService.login).toBe('function');
      expect(typeof authService.logout).toBe('function');
      expect(typeof authService.isAuthenticated).toBe('function');
    });

    it('should provide company management services', () => {
      // Test: Company service should provide core functionality
      expect(typeof companyService.activateCompany).toBe('function');
      expect(typeof companyService.companies).toBe('function');
      expect(typeof companyService.activeCompanyId).toBe('function');
    });

    it('should provide data access services', () => {
      // Test: Apollo service should provide core functionality
      expect(typeof apolloService.query).toBe('function');
      expect(typeof apolloService.mutate).toBe('function');
    });
  });

  describe('Service Integration Behavior', () => {
    it('should handle company activation workflow', () => {
      // Test: Company activation should work
      companyService.activateCompany('company-1');
      expect(companyService.activeCompanyId()).toBe('company-1');
    });

    it('should handle company data management', () => {
      // Test: Company data should be manageable
      const companies = [{ id: 'company-1', name: 'Company 1', code: 'C1', token: 'token1' }];

      companyService['companiesSignal'].set(companies);
      expect(companyService.companies().length).toBe(1);
    });

    it('should handle service state consistency', () => {
      // Test: Services should maintain consistent state
      companyService.activateCompany('company-1');
      expect(companyService.activeCompanyId()).toBe('company-1');
      expect(companyService.activeCompany()).toBeDefined();
    });
  });

  describe('Channel Token as Derived State', () => {
    it('should return active company token via getChannelToken after activation', () => {
      companyService.activateCompany('company-1');
      expect(companyService.getChannelToken()).toBe('token1');
    });

    it('should return null from getChannelToken after clearActiveCompany', () => {
      companyService.activateCompany('company-1');
      companyService.clearActiveCompany();
      expect(companyService.getChannelToken()).toBeNull();
    });

    it('should update getChannelToken when switching companies', () => {
      companyService.activateCompany('company-1');
      expect(companyService.getChannelToken()).toBe('token1');

      companyService.activateCompany('company-2');
      expect(companyService.getChannelToken()).toBe('token2');
    });

    it('should provide token to ApolloService via callback', () => {
      companyService.activateCompany('company-1');
      // ApolloService.getChannelToken() delegates to CompanyService via the registered provider
      expect(apolloService.getChannelToken()).toBe('token1');
    });
  });

  describe('Error Handling Behavior', () => {
    it('should handle missing data gracefully', () => {
      // Test: Services should handle missing data
      companyService.activateCompany('non-existent');
      expect(companyService.activeCompanyId()).toBeNull();
      expect(companyService.activeCompany()).toBeNull();
    });

    it('should handle rapid state changes', () => {
      // Test: Services should handle rapid state changes
      companyService.activateCompany('company-1');
      companyService.activateCompany('company-2');
      expect(companyService.activeCompanyId()).toBe('company-2');
    });
  });
});
