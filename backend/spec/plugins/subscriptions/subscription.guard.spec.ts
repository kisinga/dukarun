import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionGuard } from '../../../src/plugins/subscriptions/subscription.guard';
import { SubscriptionService } from '../../../src/services/subscriptions/subscription.service';
import { REQUEST_CONTEXT_KEY } from '../../../src/infrastructure/audit/get-request-context';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let subscriptionService: jest.Mocked<SubscriptionService>;

  beforeEach(() => {
    subscriptionService = {
      checkSubscriptionStatus: jest.fn(),
    } as any;
    guard = new SubscriptionGuard(subscriptionService);
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

  it('allows a billing mutation for an expired trial', async () => {
    mockGraphqlContext('mutation', 'initiateSubscriptionPurchase', null);

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('denies a write when channel is missing', async () => {
    mockGraphqlContext('mutation', 'createProduct', requestContext(undefined));

    await expect(guard.canActivate(executionContext())).rejects.toThrow(
      'Channel context is required'
    );
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('allows queries', async () => {
    mockGraphqlContext('query', 'products', null);

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(subscriptionService.checkSubscriptionStatus).not.toHaveBeenCalled();
  });
});

function executionContext(): ExecutionContext {
  return {
    getType: () => 'graphql',
    getHandler: () => executionContext,
  } as unknown as ExecutionContext;
}

function requestContext(channelId: string | undefined): any {
  return {
    channelId,
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
