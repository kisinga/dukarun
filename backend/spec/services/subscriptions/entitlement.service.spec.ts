import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { EntitlementService } from '../../../src/services/subscriptions/entitlement.service';
import { SubscriptionService } from '../../../src/services/subscriptions/subscription.service';

const createCtx = (): RequestContext => ({ activeUserId: 1 }) as RequestContext;

describe('EntitlementService', () => {
  let service: EntitlementService;
  let channelService: any;
  let subscriptionService: any;

  beforeEach(() => {
    channelService = {
      findOne: jest.fn(),
    };
    subscriptionService = {
      getSubscriptionTier: jest.fn(),
    };

    service = new EntitlementService(
      channelService,
      subscriptionService as unknown as SubscriptionService
    );
  });

  describe('getLimits', () => {
    it('returns empty limits when channel is not found', async () => {
      channelService.findOne.mockResolvedValue(null);
      const limits = await service.getLimits(createCtx(), '1');
      expect(limits).toEqual({});
    });

    it('returns tier limits when available', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        limits: { maxAdmins: 10, smsPerPeriod: 500 },
      });

      const limits = await service.getLimits(createCtx(), '1');
      expect(limits).toEqual({ maxAdmins: 10, smsPerPeriod: 500 });
    });

    it('falls back to legacy smsLimit', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        smsLimit: 300,
        limits: {},
      });

      const limits = await service.getLimits(createCtx(), '1');
      expect(limits.smsPerPeriod).toBe(300);
    });

    it('falls back to channel maxAdminCount', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1', maxAdminCount: 7 },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        limits: {},
      });

      const limits = await service.getLimits(createCtx(), '1');
      expect(limits.maxAdmins).toBe(7);
    });
  });

  describe('checkLimit', () => {
    it('allows usage when no limit is set', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({ limits: {} });

      const result = await service.checkLimit(createCtx(), '1', 'maxAdmins', 99);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(0);
    });

    it('allows usage below the limit', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        limits: { maxAdmins: 5 },
      });

      const result = await service.checkLimit(createCtx(), '1', 'maxAdmins', 4);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
    });

    it('denies usage at the limit', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        limits: { maxAdmins: 5 },
      });

      const result = await service.checkLimit(createCtx(), '1', 'maxAdmins', 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Admin limit reached');
    });
  });

  describe('getLimit', () => {
    it('returns the limit value for a key', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({
        limits: { smsPerPeriod: 250 },
      });

      const limit = await service.getLimit(createCtx(), '1', 'smsPerPeriod');
      expect(limit).toBe(250);
    });

    it('returns undefined when the key is not set', async () => {
      channelService.findOne.mockResolvedValue({
        customFields: { subscriptionTierId: 'tier-1' },
      });
      subscriptionService.getSubscriptionTier.mockResolvedValue({ limits: {} });

      const limit = await service.getLimit(createCtx(), '1', 'smsPerPeriod');
      expect(limit).toBeUndefined();
    });
  });
});
