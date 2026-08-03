import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionGuard } from '../../../src/plugins/subscriptions/subscription.guard';
import { SubscriptionService } from '../../../src/services/subscriptions/subscription.service';
import { REQUEST_CONTEXT_KEY } from '../../../src/infrastructure/audit/get-request-context';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let reflector: Reflector;

  beforeEach(() => {
    subscriptionService = {
      checkSubscriptionStatus: jest.fn(),
    } as any;
    reflector = new Reflector();
    guard = new SubscriptionGuard(subscriptionService, reflector);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks a normal mutation for an expired trial', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: false,
      access: 'read_only',
      status: 'expired',
      reason: 'trial_expired',
      canWrite: false,
      canRead: true,
      canPerformAction: false,
    });
    mockGraphqlContext('mutation', 'createProduct', requestContext('1'));

    await expect(guard.canActivate(executionContext())).rejects.toThrow(
      'Subscription access denied'
    );
    expect(subscriptionService.checkSubscriptionStatus).toHaveBeenCalledWith(
      expect.any(Object),
      '1'
    );
  });

  it('allows queries for read-only access', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: false,
      access: 'read_only',
      status: 'expired',
      reason: 'trial_expired',
      canWrite: false,
      canRead: true,
      canPerformAction: false,
    });
    mockGraphqlContext('query', 'orders', requestContext('1'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
  });

  it('blocks queries and mutations when subscription is suspended', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: false,
      access: 'blocked',
      status: 'expired',
      reason: 'grace_period_ended',
      canWrite: false,
      canRead: false,
      canPerformAction: false,
    });
    mockGraphqlContext('query', 'orders', requestContext('1'));

    await expect(guard.canActivate(executionContext())).rejects.toThrow('Subscription suspended');

    mockGraphqlContext('mutation', 'createProduct', requestContext('1'));
    await expect(guard.canActivate(executionContext())).rejects.toThrow(
      'Subscription access denied'
    );
  });

  it('allows a billing mutation for a suspended channel', async () => {
    mockGraphqlContext('mutation', 'initiateSubscriptionPurchase', null);

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows status queries for a suspended channel', async () => {
    mockGraphqlContext('query', 'checkSubscriptionStatus', requestContext('1'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows tier queries for a suspended channel without a channel context', async () => {
    mockGraphqlContext('query', 'getSubscriptionTiers', null);

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows shop storefront queries for a suspended channel', async () => {
    mockGraphqlContext('query', 'storefront', requestContext('1', 'shop'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows storefront queries even when context or channel are missing', async () => {
    mockGraphqlContext('query', 'storefront', null);

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();

    mockGraphqlContext('query', 'publicStorefronts', requestContext(undefined, 'shop'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('blocks non-public shop operations for a suspended channel', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: false,
      access: 'blocked',
      status: 'expired',
      reason: 'grace_period_ended',
      canWrite: false,
      canRead: false,
      canPerformAction: false,
    });

    mockGraphqlContext('query', 'activeCustomer', requestContext('1', 'shop'));
    await expect(guard.canActivate(executionContext())).rejects.toThrow('Subscription suspended');

    mockGraphqlContext('mutation', 'addItemToOrder', requestContext('1', 'shop'));
    await expect(guard.canActivate(executionContext())).rejects.toThrow(
      'Subscription access denied'
    );
  });

  it('denies a write when channel is missing', async () => {
    mockGraphqlContext('mutation', 'createProduct', requestContext(undefined));

    await expect(guard.canActivate(executionContext())).rejects.toThrow(
      'Channel context is required'
    );
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows queries for active subscriptions', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: true,
      access: 'full',
      status: 'active',
      reason: 'active_valid',
      canWrite: true,
      canRead: true,
      canPerformAction: true,
    });
    mockGraphqlContext('query', 'orders', requestContext('1'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
  });

  it('allows mutations for active subscriptions', async () => {
    subscriptionService.checkSubscriptionStatus.mockResolvedValue({
      isValid: true,
      access: 'full',
      status: 'active',
      reason: 'active_valid',
      canWrite: true,
      canRead: true,
      canPerformAction: true,
    });
    mockGraphqlContext('mutation', 'createProduct', requestContext('1'));

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
  });
});

function executionContext(): ExecutionContext {
  return {
    getType: () => 'graphql',
    getHandler: () => executionContext,
  } as unknown as ExecutionContext;
}

function requestContext(channelId: string | undefined, apiType = 'admin'): any {
  return {
    channelId,
    apiType,
    userHasPermissions: jest.fn(() => false),
  };
}

function mockGraphqlContext(operation: 'query' | 'mutation', fieldName: string, ctx: any): void {
  const req = ctx ? { [REQUEST_CONTEXT_KEY]: { default: ctx } } : {};
  jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
    getInfo: () => ({
      operation: { operation },
      fieldName,
      parentType: { name: operation === 'mutation' ? 'Mutation' : 'Query' },
    }),
    getContext: () => ({ req }),
    getArgs: () => ({}),
  } as any);
}
