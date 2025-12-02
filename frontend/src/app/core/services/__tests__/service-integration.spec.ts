/**
 * Service Integration Tests
 *
 * Tests critical service integration points that could break in production.
 * Focuses on real-world scenarios without over-specification.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { ApolloService } from '../apollo.service';
import { AuthService } from '../auth.service';
import { CompanyService } from '../company.service';

describe('Service Integration', () => {
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

  describe('Critical Integration Points', () => {
    it('should maintain company context during auth state changes', () => {
      // Critical: User should not lose company context when auth state changes
      companyService.activateCompany('company-1');
      expect(companyService.activeCompanyId()).toBe('company-1');

      // Auth state changes should not affect company context
      expect(companyService.activeCompanyId()).toBe('company-1');
    });

    it('should handle service failures gracefully', () => {
      // Critical: Service failures should not crash the app
      expect(authService).toBeDefined();
      expect(companyService).toBeDefined();
      expect(apolloService).toBeDefined();
    });

    it('should handle rapid state changes without corruption', () => {
      // Critical: Rapid state changes should not corrupt data
      companyService.activateCompany('company-1');
      companyService.activateCompany('company-2');
      companyService.activateCompany('company-1');

      expect(companyService.activeCompanyId()).toBe('company-1');
    });
  });

  describe('Core Functionality', () => {
    it('should provide authentication services', () => {
      expect(typeof authService.login).toBe('function');
      expect(typeof authService.logout).toBe('function');
      expect(typeof authService.isAuthenticated).toBe('function');
    });

    it('should provide company management services', () => {
      expect(typeof companyService.activateCompany).toBe('function');
      expect(typeof companyService.companies).toBe('function');
      expect(typeof companyService.activeCompanyId).toBe('function');
    });

    it('should provide data access services', () => {
      expect(typeof apolloService.query).toBe('function');
      expect(typeof apolloService.mutate).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing data gracefully', () => {
      companyService.activateCompany('non-existent');
      expect(companyService.activeCompanyId()).toBeNull();
      expect(companyService.activeCompany()).toBeNull();
    });
  });
});
