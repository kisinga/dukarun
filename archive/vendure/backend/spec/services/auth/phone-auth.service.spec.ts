import { describe, expect, it, jest } from '@jest/globals';
import { Channel } from '@vendure/core';
import { ChannelStatus } from '../../../src/domain/channel-custom-fields';
import {
  AccessLevel,
  AuthorizationStatus,
  PhoneAuthService,
} from '../../../src/services/auth/phone-auth.service';

describe('PhoneAuthService.verifyLoginOTP', () => {
  const buildService = (options?: { channelStatus?: ChannelStatus }) => {
    const channelStatus = options?.channelStatus ?? ChannelStatus.UNAPPROVED;

    const redisMock = {
      setex: jest.fn(),
    };

    const otpService = {
      verifyOTP: jest.fn(async () => ({ valid: true, message: 'OTP valid' })),
      requestOTP: jest.fn(),
      redis: redisMock,
    };

    const channelService = {
      findOne: jest.fn(async () => ({
        id: 42,
        customFields: { status: channelStatus },
      })),
    };

    const channelRepo = {
      findOne: jest.fn(async () => ({
        id: 42,
        customFields: { status: channelStatus },
      })),
    };

    const userRepo = {
      findOne: jest.fn(async () => ({
        id: 7,
        identifier: '0712345678',
        customFields: {
          authorizationStatus: AuthorizationStatus.PENDING,
        },
        roles: [
          {
            id: 11,
            channels: [{ id: 42 }],
          },
        ],
      })),
    };

    const connection = {
      getRepository: jest.fn((ctx: any, entity: any) => {
        // Check if entity is Channel class
        if (entity === Channel || (entity && entity.name === 'Channel')) {
          return channelRepo;
        }
        return userRepo;
      }),
    };

    const service = new PhoneAuthService(
      otpService as any,
      { getUserByEmailAddress: jest.fn() } as any,
      channelService as any,
      {} as any,
      {} as any, // registrationValidator
      {} as any, // registrationStorageService
      connection as any
    );

    return { service, redisMock, otpService, channelService, channelRepo, userRepo };
  };

  it('blocks login when every channel is UNAPPROVED', async () => {
    const { service, redisMock } = buildService({ channelStatus: ChannelStatus.UNAPPROVED });

    const result = await service.verifyLoginOTP({} as any, '0712345678', '123456');

    expect(result.success).toBe(false);
    expect(result.message).toContain('pending approval');
    expect(redisMock.setex).not.toHaveBeenCalled();
  });

  it('allows login when at least one channel is APPROVED', async () => {
    const { service, redisMock, channelRepo } = buildService({
      channelStatus: ChannelStatus.APPROVED,
    });

    const result = await service.verifyLoginOTP({} as any, '0712345678', '123456');

    expect(result.success).toBe(true);
    expect(result.accessLevel).toBe(AccessLevel.FULL);
    expect(result.message).toBe('OTP verified successfully.');
    expect(redisMock.setex).toHaveBeenCalledTimes(1);
    // findChannelById uses repository when bypassSellerFilter=true, not channelService
    expect(channelRepo.findOne).toHaveBeenCalled();
  });
});
