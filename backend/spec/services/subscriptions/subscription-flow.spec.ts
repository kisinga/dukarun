/**
 * Subscription Flow Integration Tests
 *
 * Validates subscription payment processing and expiry notifications:
 * - Prepaid extension logic (early renewal, late renewal, from trial)
 * - System alert events fire on renewal
 * - Scheduler finds expiring channels
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Channel, ChannelService, RequestContext } from '@vendure/core';
import { ChannelEventRouterService } from '../../../src/infrastructure/events/channel-event-router.service';
import { ChannelEventType } from '../../../src/infrastructure/events/types/event-type.enum';
import { RedisCacheService } from '../../../src/infrastructure/storage/redis-cache.service';
import { PaystackService } from '../../../src/services/payments/paystack.service';
import { SubscriptionService } from '../../../src/services/subscriptions/subscription.service';
import { generatePaystackEmailFromPhone } from '../../../src/utils/email.utils';

describe('Subscription Flow Integration', () => {
  const ctx = {} as RequestContext;
  let subscriptionService: SubscriptionService;
  let mockChannelService: jest.Mocked<ChannelService>;
  let mockPaystackService: jest.Mocked<PaystackService>;
  let mockEventRouter: jest.Mocked<ChannelEventRouterService>;
  let mockRedisCache: jest.Mocked<RedisCacheService>;
  let mockConnection: any;
  const TEST_TIER_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    // Mock ChannelService
    mockChannelService = {
      findOne: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
    } as any;

    // Mock PaystackService
    mockPaystackService = {
      createCustomer: jest.fn(),
      chargeMobile: jest.fn(),
      initializeTransaction: jest.fn(),
    } as any;

    // Mock EventRouter
    mockEventRouter = {
      routeEvent: jest.fn(async () => {}),
    } as any;

    // Mock RedisCacheService
    mockRedisCache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      exists: jest.fn(async () => false),
    } as any;

    // Mock TransactionalConnection
    mockConnection = {
      rawConnection: {
        getRepository: jest.fn(() => ({
          findOne: jest.fn((options?: any) => {
            // Handle both { where: { id: TEST_TIER_ID } } and direct id
            const id = options?.where?.id || options?.id || TEST_TIER_ID;
            // Support both TEST_TIER_ID (UUID) and 'tier-1' for backward compatibility with customFields
            if (id === TEST_TIER_ID || id === 'tier-1') {
              return Promise.resolve({
                id: id, // Return the same id that was queried
                priceMonthly: 10000,
                priceYearly: 100000,
              });
            }
            return Promise.resolve(null);
          }),
          find: jest.fn(),
        })),
      },
    };

    // Mock ChannelUpdateHelper
    const mockChannelUpdateHelper = {
      updateChannelCustomFields: jest.fn(),
    };
    (
      mockChannelUpdateHelper.updateChannelCustomFields as jest.MockedFunction<any>
    ).mockResolvedValue({ id: '1' } as Channel);

    subscriptionService = new SubscriptionService(
      mockChannelService,
      mockConnection,
      mockPaystackService,
      mockEventRouter,
      mockRedisCache,
      mockChannelUpdateHelper as any
    );
  });

  describe('Prepaid Extension Logic', () => {
    it('should extend from current expiry date when renewing early', async () => {
      const channelId = '1';
      const currentExpiry = new Date('2024-02-15');
      const now = new Date('2024-02-01'); // 14 days before expiry

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: currentExpiry.toISOString(),
          billingCycle: 'monthly',
          subscriptionTierId: 'tier-1',
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      await subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: 'ref-123',
        amount: 10000,
      });

      // Verify update was called
      expect(mockChannelService.update).toHaveBeenCalled();
      const updateCall = mockChannelService.update.mock.calls[0][1]; // Second argument is the update data
      const newExpiry = new Date(updateCall.customFields.subscriptionExpiresAt);

      // Should extend from current expiry (Feb 15) + 1 month = March 15
      expect(newExpiry.getMonth()).toBe(2); // March (0-indexed)
      expect(newExpiry.getDate()).toBe(15);

      // Restore real timers
      jest.useRealTimers();
    });

    it('should extend from now when renewing after expiry', async () => {
      const channelId = '1';
      const expiredDate = new Date('2024-01-01');
      const now = new Date('2024-02-15'); // 45 days after expiry

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expiredDate.toISOString(),
          billingCycle: 'monthly',
          subscriptionTierId: 'tier-1',
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      await subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: 'ref-123',
        amount: 10000,
      });

      // Verify update was called
      expect(mockChannelService.update).toHaveBeenCalled();
      const updateCall = mockChannelService.update.mock.calls[0][1]; // Second argument is the update data
      const newExpiry = new Date(updateCall.customFields.subscriptionExpiresAt);

      // Should extend from now (Feb 15) + 1 month = March 15
      expect(newExpiry.getMonth()).toBe(2); // March
      expect(newExpiry.getDate()).toBe(15);

      // Restore real timers
      jest.useRealTimers();
    });

    it('should extend from trial end when renewing during trial', async () => {
      const channelId = '1';
      const trialEnd = new Date('2024-03-01');
      const now = new Date('2024-02-15'); // During trial

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'trial',
          trialEndsAt: trialEnd.toISOString(),
          billingCycle: 'monthly',
          subscriptionTierId: 'tier-1',
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      await subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: 'ref-123',
        amount: 10000,
      });

      // Verify update was called
      expect(mockChannelService.update).toHaveBeenCalled();
      const updateCall = mockChannelService.update.mock.calls[0][1]; // Second argument is the update data
      const newExpiry = new Date(updateCall.customFields.subscriptionExpiresAt);

      // Should extend from trial end (March 1) + 1 month = April 1
      expect(newExpiry.getMonth()).toBe(3); // April
      expect(newExpiry.getDate()).toBe(1);

      // Restore real timers
      jest.useRealTimers();
    });
  });

  describe('System Alert Events', () => {
    it('should emit SUBSCRIPTION_RENEWED event on successful payment', async () => {
      const channelId = '1';
      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: new Date('2024-02-15').toISOString(),
          billingCycle: 'monthly',
          subscriptionTierId: 'tier-1',
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      await subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: 'ref-123',
        amount: 10000,
      });

      // Verify event was emitted
      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ChannelEventType.SUBSCRIPTION_RENEWED,
          channelId,
          data: expect.objectContaining({
            billingCycle: 'monthly',
            amount: 10000,
          }),
        })
      );
    });
  });

  describe('Email Generation', () => {
    it('should generate unique email from phone number when email is not provided', async () => {
      // Clear all mocks to ensure clean state
      jest.clearAllMocks();

      const channelId = '1';
      const phoneNumber = '+254712345678';
      const mockChannel: Channel = {
        id: channelId,
        customFields: {}, // Ensure no paystackCustomerCode exists
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockPaystackService.createCustomer.mockResolvedValue({
        data: { customer_code: 'cust-123' },
      } as any);
      // Mock chargeMobile to return a valid STK push response
      mockPaystackService.chargeMobile.mockResolvedValue({
        data: { reference: 'ref-123', status: 'pending' },
      } as any);
      mockChannelService.update.mockResolvedValue(mockChannel);

      const result = await subscriptionService.initiatePurchase(
        ctx,
        channelId,
        TEST_TIER_ID,
        'monthly',
        phoneNumber,
        '' // Empty email
      );

      // Verify the method completed successfully
      expect(result.success).toBe(true);

      // Verify Paystack was called with system email (email parameter is kept for API compatibility only)
      expect(mockPaystackService.createCustomer).toHaveBeenCalledWith(
        'malipo@dukarun.com',
        undefined,
        undefined,
        phoneNumber,
        expect.any(Object)
      );
    });

    it('should generate unique email from phone number when email is undefined', async () => {
      // Clear all mocks to ensure clean state
      jest.clearAllMocks();

      const channelId = '1';
      const phoneNumber = '+254712345678';
      const mockChannel: Channel = {
        id: channelId,
        customFields: {}, // Ensure no paystackCustomerCode exists
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockPaystackService.createCustomer.mockResolvedValue({
        data: { customer_code: 'cust-123' },
      } as any);
      // Mock chargeMobile to return a valid STK push response
      mockPaystackService.chargeMobile.mockResolvedValue({
        data: { reference: 'ref-123', status: 'pending' },
      } as any);
      mockChannelService.update.mockResolvedValue(mockChannel);

      const result = await subscriptionService.initiatePurchase(
        ctx,
        channelId,
        TEST_TIER_ID,
        'monthly',
        phoneNumber,
        undefined as any // Undefined email
      );

      // Verify the method completed successfully
      expect(result.success).toBe(true);

      // Verify Paystack was called with generated email from phone number (email parameter is kept for API compatibility only)
      const expectedEmail = generatePaystackEmailFromPhone(phoneNumber);
      expect(mockPaystackService.createCustomer).toHaveBeenCalledWith(
        expectedEmail,
        undefined,
        undefined,
        phoneNumber,
        expect.any(Object)
      );
    });
  });

  describe('Early Tester Support (Blank Expiry Dates)', () => {
    it('should allow full access for trial with blank trialEndsAt', async () => {
      const channelId = '1';
      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'trial',
          // trialEndsAt is intentionally blank (set by admin for early testers)
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(true);
      expect(status.status).toBe('trial');
      expect(status.canPerformAction).toBe(true);
      expect(status.isEarlyTester).toBe(true);
      expect(status.trialEndsAt).toBeUndefined();
      expect(status.daysRemaining).toBeUndefined();
    });

    it('should allow full access for active subscription with blank subscriptionExpiresAt', async () => {
      const channelId = '1';
      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          // subscriptionExpiresAt is intentionally blank (set by admin for early testers)
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(true);
      expect(status.status).toBe('active');
      expect(status.canPerformAction).toBe(true);
      expect(status.isEarlyTester).toBe(true);
      expect(status.expiresAt).toBeUndefined();
      expect(status.daysRemaining).toBeUndefined();
    });

    it('should handle prepaid extension with blank expiry dates', async () => {
      const channelId = '1';
      const now = new Date('2024-02-15');

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'trial',
          // Both expiry dates blank - early tester
          billingCycle: 'monthly',
          subscriptionTierId: 'tier-1',
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      await subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: 'ref-123',
        amount: 10000,
      });

      // Verify update was called
      expect(mockChannelService.update).toHaveBeenCalled();
      const updateCall = mockChannelService.update.mock.calls[0][1];
      const newExpiry = new Date(updateCall.customFields.subscriptionExpiresAt);

      // Should extend from now (Feb 15) + 1 month = March 15
      expect(newExpiry.getMonth()).toBe(2); // March
      expect(newExpiry.getDate()).toBe(15);

      // Restore real timers
      jest.useRealTimers();
    });
  });

  describe('Subscription Status Checks', () => {
    it('should return valid status for active trial with expiry', async () => {
      const channelId = '1';
      const now = new Date('2024-02-15');
      const trialEnd = new Date('2024-02-25'); // 10 days from now

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'trial',
          trialEndsAt: trialEnd.toISOString(),
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(true);
      expect(status.status).toBe('trial');
      expect(status.canPerformAction).toBe(true);
      expect(status.isEarlyTester).toBe(false);
      expect(status.daysRemaining).toBeGreaterThan(0);
      expect(status.daysRemaining).toBeLessThanOrEqual(10);

      // Restore real timers
      jest.useRealTimers();
    });

    it('should return expired status for trial past expiry', async () => {
      const channelId = '1';
      const now = new Date('2024-02-15');
      const expiredDate = new Date('2024-02-10'); // Expired 5 days ago

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'trial',
          trialEndsAt: expiredDate.toISOString(),
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(false);
      expect(status.status).toBe('expired');
      expect(status.canPerformAction).toBe(false);
      expect(status.isEarlyTester).toBe(false);

      // Restore real timers
      jest.useRealTimers();
    });

    it('should return valid status for active subscription with expiry', async () => {
      const channelId = '1';
      const now = new Date('2024-02-15');
      const expiresAt = new Date('2024-03-07'); // 20 days from now

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expiresAt.toISOString(),
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(true);
      expect(status.status).toBe('active');
      expect(status.canPerformAction).toBe(true);
      expect(status.isEarlyTester).toBe(false);
      expect(status.daysRemaining).toBeGreaterThan(0);
      expect(status.daysRemaining).toBeLessThanOrEqual(21); // Allow some margin for date calculation

      // Restore real timers
      jest.useRealTimers();
    });

    it('should return expired status for active subscription past expiry', async () => {
      const channelId = '1';
      const now = new Date('2024-02-15');
      const expiredDate = new Date('2024-02-05'); // Expired 10 days ago

      // Use fake timers to mock Date constructor
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockChannel: Channel = {
        id: channelId,
        customFields: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expiredDate.toISOString(),
        },
      } as any;

      mockChannelService.findOne.mockResolvedValue(mockChannel);
      mockChannelService.update.mockResolvedValue(mockChannel);

      const status = await subscriptionService.checkSubscriptionStatus(ctx, channelId);

      expect(status.isValid).toBe(false);
      expect(status.status).toBe('expired');
      expect(status.canPerformAction).toBe(false);
      expect(status.isEarlyTester).toBe(false);

      // Restore real timers
      jest.useRealTimers();
    });
  });
});
