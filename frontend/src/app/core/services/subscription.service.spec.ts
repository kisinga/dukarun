import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SubscriptionService } from './subscription.service';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let querySpy: jasmine.Spy;

  beforeEach(() => {
    querySpy = jasmine.createSpy('query').and.resolveTo({
      data: {
        checkSubscriptionStatus: {
          isValid: false,
          access: 'read_only',
          status: 'expired',
          reason: 'trial_expired',
          expiresAt: '2026-07-01T00:00:00.000Z',
          trialEndsAt: '2026-07-01T00:00:00.000Z',
          exemptionEndsAt: null,
          exemptionReason: null,
          canWrite: false,
          canPerformAction: false,
        },
      },
    });

    TestBed.configureTestingModule({
      providers: [
        SubscriptionService,
        { provide: ApolloService, useValue: { getClient: () => ({ query: querySpy }) } },
        { provide: CompanyService, useValue: { activeCompanyId: signal('1') } },
      ],
    });

    service = TestBed.inject(SubscriptionService);
  });

  it('stores backend access result as UI state', async () => {
    await service.checkSubscriptionStatus();

    expect(service.accessState()).toEqual({
      access: 'read_only',
      status: 'expired',
      reason: 'trial_expired',
      expiresAt: '2026-07-01T00:00:00.000Z',
      canWrite: false,
    });
    expect(service.canWrite()).toBe(false);
  });

  it('normalizes backend subscription denial errors', async () => {
    querySpy.and.resolveTo({
      error: new Error(
        'Subscription access denied. Current status: expired. Please renew your subscription to continue.',
      ),
    });

    await service.checkSubscriptionStatus();

    expect(service.error()).toBe('Your subscription is read-only. Renew to continue editing.');
  });
});
