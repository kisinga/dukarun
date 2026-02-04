import { NativeAuthenticationStrategy, RequestContext, User, UserService } from '@vendure/core';
import { OtpTokenAuthStrategy } from '../../src/plugins/auth/otp-token-auth.strategy';

describe('OtpTokenAuthStrategy', () => {
  const ctx = {} as RequestContext;

  it('delegates non-OTP passwords to NativeAuthenticationStrategy when available', async () => {
    const native = {
      authenticate: jest.fn().mockResolvedValue({ id: 1 } as unknown as User),
    } as unknown as NativeAuthenticationStrategy;

    const strategy = new OtpTokenAuthStrategy(undefined, native);

    const result = await strategy.authenticate(ctx, {
      username: 'superadmin',
      password: 'superadmin',
    });

    expect(native.authenticate).toHaveBeenCalledWith(ctx, {
      username: 'superadmin',
      password: 'superadmin',
    });
    expect((result as { id?: number })?.id).toBe(1);
  });

  it('returns false for OTP token when redis is not available', async () => {
    const strategy = new OtpTokenAuthStrategy();
    (strategy as any).otpService = { redis: null };

    const result = await strategy.authenticate(ctx, {
      username: '0712345678',
      password: 'otp_session_abc',
    });

    expect(result).toBe(false);
  });

  it('uses OTP session when available and matches user, falling back otherwise', async () => {
    const user = { id: 7 } as unknown as User;
    const userService = {
      getUserByEmailAddress: jest.fn().mockResolvedValue(user),
    } as unknown as UserService;
    const native = new NativeAuthenticationStrategy();
    const nativeSpy = jest.spyOn(native, 'authenticate').mockResolvedValue(false);

    const redisStore: Record<string, string> = {
      'otp:session:otp_session_token': JSON.stringify({
        userId: '7',
        phoneNumber: '0712345678',
      }),
    };

    const otpService = {
      redis: {
        get: jest.fn((key: string) => Promise.resolve(redisStore[key] ?? null)),
        del: jest.fn(() => Promise.resolve(1)),
      },
    };

    const strategy = new OtpTokenAuthStrategy(otpService as any, native);
    (strategy as any).userService = userService;

    const result = await strategy.authenticate(ctx, {
      username: '0712345678',
      password: 'otp_session_token',
    });

    expect(userService.getUserByEmailAddress).toHaveBeenCalledWith(ctx, '0712345678');
    expect(otpService.redis.get as jest.Mock).toHaveBeenCalledWith('otp:session:otp_session_token');
    expect(otpService.redis.del).toHaveBeenCalled();
    expect(nativeSpy).not.toHaveBeenCalled();
    expect(result).toBe(user);
  });
});
