import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RequestContext, EventBus } from '@vendure/core';
import Redis from 'ioredis';
import { BRAND_CONFIG } from '../../constants/brand.constants';
import { env } from '../../infrastructure/config/environment.config';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { maskEmail } from '../../utils/email.utils';
import { OtpEmailEvent } from '../../events/otp-email.event';

/**
 * OTP Service
 * Generates, stores, validates, and sends OTP codes via SMS
 * Uses Redis for fast, short-lived OTP storage
 */
@Injectable()
export class OtpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtpService.name);
  public redis: Redis | null = null; // Public for access by auth strategy

  // Configuration
  private readonly OTP_LENGTH = 6;
  private readonly OTP_EXPIRY_SECONDS = 5 * 60; // 5 minutes
  private readonly MAX_ATTEMPTS = 3;
  // Rate limiting - relaxed in development (default to dev if not explicitly production)
  private readonly IS_PRODUCTION: boolean;
  private readonly RATE_LIMIT_COUNT: number;
  private readonly RATE_LIMIT_WINDOW_SECONDS: number;

  constructor(
    private readonly smsService: SmsService,
    private readonly eventBus: EventBus
  ) {
    // Initialize production mode check using EnvironmentConfig
    this.IS_PRODUCTION = env.isProduction();
    this.RATE_LIMIT_COUNT = this.IS_PRODUCTION ? 10 : 30;
    this.RATE_LIMIT_WINDOW_SECONDS = this.IS_PRODUCTION ? 15 * 60 : 30; // 15 min prod, 30 sec dev
  }

  async onModuleInit() {
    // Initialize Redis connection (non-blocking - don't wait for connection)
    // Environment variables are loaded by vendure-config.ts (same pattern as DB config)
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

    try {
      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        connectTimeout: 5000, // 5 second timeout for initial connection
        retryStrategy: times => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: false, // Connect immediately but don't block
        enableReadyCheck: false, // Don't wait for ready state
      });

      this.redis.on('error', error => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('connect', () => {
        this.logger.log('✅ Redis connected for OTP storage');
      });

      // Test connection asynchronously - don't block module init
      // Connection will be verified on first use
      setImmediate(async () => {
        try {
          await this.redis?.ping();
          this.logger.log('✅ Redis connection verified');
        } catch (pingError) {
          this.logger.warn('⚠️ Redis ping failed:', pingError);
          this.logger.warn('OTP service will retry on first use');
        }
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      this.logger.warn('OTP service will use in-memory storage (not recommended for production)');
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Generate a random 6-digit OTP code
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get Redis key for OTP storage
   */
  private getOTPKey(phoneNumber: string): string {
    return `otp:phone:${phoneNumber}`;
  }

  /**
   * Get Redis key for rate limiting
   */
  private getRateLimitKey(phoneNumber: string): string {
    return `otp:rate:${phoneNumber}`;
  }

  /**
   * Get Redis key for OTP attempts
   */
  private getAttemptsKey(phoneNumber: string): string {
    return `otp:attempts:${phoneNumber}`;
  }

  /**
   * Check if phone number is rate limited
   */
  private async isRateLimited(phoneNumber: string): Promise<boolean> {
    if (!this.redis) return false;

    try {
      const key = this.getRateLimitKey(phoneNumber);
      const count = await this.redis.get(key);

      if (!count) {
        return false;
      }

      const countNum = parseInt(count, 10);
      if (countNum >= this.RATE_LIMIT_COUNT) {
        const ttl = await this.redis.ttl(key);
        const remainingMinutes = Math.ceil(ttl / 60);
        throw new Error(`Too many requests. Please try again in ${remainingMinutes} minute(s).`);
      }

      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Too many requests')) {
        throw error;
      }
      this.logger.error('Rate limit check error:', error);
      return false;
    }
  }

  /**
   * Update rate limit counter
   */
  private async updateRateLimit(phoneNumber: string): Promise<void> {
    if (!this.redis) return;

    try {
      const key = this.getRateLimitKey(phoneNumber);
      const count = await this.redis.incr(key);

      if (count === 1) {
        // Set expiry on first request
        await this.redis.expire(key, this.RATE_LIMIT_WINDOW_SECONDS);
      }
    } catch (error) {
      this.logger.error('Rate limit update error:', error);
    }
  }

  /**
   * Send SMS via configured SMS provider
   */
  private async sendSMS(phoneNumber: string, message: string): Promise<void> {
    try {
      // Use SmsService directly with isOtp flag for OTP routing
      const result = await this.smsService.sendSms(phoneNumber, message, true);

      if (!result.success) {
        // Log error but don't throw - OTP is still generated, just SMS failed
        this.logger.error(`Failed to send SMS: ${result.error}`);

        // Log OTP in development for testing purposes
        if (!this.IS_PRODUCTION) {
          this.logger.warn(`SMS not sent. OTP code: ${message.match(/\d{6}/)?.[0] || 'N/A'}`);
        }
      }
    } catch (error) {
      this.logger.error('SMS sending error:', error);
      // Don't throw - OTP is still generated, just log the error
    }
  }

  /**
   * Send OTP via Email
   */
  private async sendEmail(email: string, otp: string, ctx?: RequestContext): Promise<void> {
    if (!ctx) {
      this.logger.error('Cannot send OTP email without RequestContext');
      return;
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      this.logger.error(
        `Invalid email address provided: ${typeof email === 'string' ? maskEmail(email) : typeof email}`
      );
      return;
    }

    try {
      this.logger.log(`Publishing OTP email event for: ${maskEmail(email)}`);
      this.eventBus.publish(new OtpEmailEvent(ctx, email, otp));
      this.logger.log(`OTP email event published successfully for: ${maskEmail(email)}`);
    } catch (error) {
      this.logger.error(`Email sending error for ${maskEmail(email)}:`, error);
    }
  }

  /**
   * Request OTP for phone number
   * Request OTP for phone number (and optionally email)
   */
  async requestOTP(
    identifier: string,
    purpose: 'registration' | 'login' = 'login',
    ctx?: RequestContext,
    channelId?: string,
    email?: string
  ): Promise<{
    success: boolean;
    message: string;
    expiresAt?: number;
  }> {
    // Determine if identifier is email or phone
    const isEmailIdentifier = identifier.includes('@');
    let storageKey: string;

    if (isEmailIdentifier) {
      storageKey = identifier;
    } else {
      storageKey = formatPhoneNumber(identifier);
    }

    await this.isRateLimited(storageKey);

    const otpCode = this.generateOTP();
    const expiresAt = Date.now() + this.OTP_EXPIRY_SECONDS * 1000;

    if (this.redis) {
      try {
        const otpKey = this.getOTPKey(storageKey);
        const attemptsKey = this.getAttemptsKey(storageKey);

        await this.redis.setex(otpKey, this.OTP_EXPIRY_SECONDS, otpCode);
        await this.redis.setex(attemptsKey, this.OTP_EXPIRY_SECONDS, '0');
      } catch (error) {
        this.logger.error('Failed to store OTP:', error);
        throw new Error('Failed to generate OTP. Please try again.');
      }
    }

    await this.updateRateLimit(storageKey);

    // Send SMS (Primary Channel) - Only if it's a phone number
    if (!isEmailIdentifier) {
      const message = `Your ${BRAND_CONFIG.name} verification code is: ${otpCode} Valid for 5 minutes.`;
      await this.sendSMS(storageKey, message);
    }

    // Send Email (Secondary Channel) if provided OR if identifier is email
    const targetEmail = email || (isEmailIdentifier ? identifier : undefined);
    if (targetEmail && typeof targetEmail === 'string' && targetEmail.trim().length > 0) {
      this.logger.log(`Attempting to send OTP email to: ${maskEmail(targetEmail)}`);
      await this.sendEmail(targetEmail, otpCode, ctx);
    } else if (email !== undefined) {
      // Email was explicitly passed but is invalid
      this.logger.warn(
        `Invalid email parameter: ${typeof email === 'string' ? maskEmail(email) : typeof email}`
      );
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      expiresAt: Math.floor(expiresAt / 1000),
    };
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(
    identifier: string,
    otp: string
  ): Promise<{
    valid: boolean;
    message: string;
  }> {
    // Determine if identifier is email or phone
    const isEmailIdentifier = identifier.includes('@');
    let storageKey: string;

    if (isEmailIdentifier) {
      storageKey = identifier;
    } else {
      // Normalize phone number to 07XXXXXXXX format
      storageKey = formatPhoneNumber(identifier);
    }

    if (!this.redis) {
      return {
        valid: false,
        message: 'OTP service unavailable. Please try again.',
      };
    }

    try {
      const otpKey = this.getOTPKey(storageKey);
      const attemptsKey = this.getAttemptsKey(storageKey);

      // Get stored OTP
      const storedOTP = await this.redis.get(otpKey);

      if (!storedOTP) {
        return {
          valid: false,
          message: 'OTP not found. Please request a new OTP.',
        };
      }

      // Check attempts
      const attempts = parseInt((await this.redis.get(attemptsKey)) || '0', 10);
      if (attempts >= this.MAX_ATTEMPTS) {
        // Delete OTP after max attempts
        await this.redis.del(otpKey);
        await this.redis.del(attemptsKey);
        return {
          valid: false,
          message: 'Maximum verification attempts exceeded. Please request a new OTP.',
        };
      }

      const enteredOTP = otp.trim();
      const storedOTPTrimmed = storedOTP.trim();

      if (storedOTPTrimmed !== enteredOTP) {
        // Increment attempts
        await this.redis.incr(attemptsKey);
        const remainingAttempts = this.MAX_ATTEMPTS - (attempts + 1);

        if (remainingAttempts <= 0) {
          await this.redis.del(otpKey);
          await this.redis.del(attemptsKey);
          return {
            valid: false,
            message: 'Invalid OTP. Maximum attempts exceeded. Please request a new OTP.',
          };
        }

        return {
          valid: false,
          message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
        };
      }

      // Success - delete OTP and attempts
      await this.redis.del(otpKey);
      await this.redis.del(attemptsKey);

      return {
        valid: true,
        message: 'OTP verified successfully',
      };
    } catch (error) {
      this.logger.error('OTP verification error:', error);
      return {
        valid: false,
        message: 'OTP verification failed. Please try again.',
      };
    }
  }

  /**
   * Get remaining time until rate limit resets (in seconds)
   */
  async getRateLimitRemaining(identifier: string): Promise<number> {
    if (!this.redis) return 0;

    try {
      const key = this.getRateLimitKey(identifier);
      const ttl = await this.redis.ttl(key);
      return Math.max(0, ttl);
    } catch (error) {
      this.logger.error('Rate limit remaining check error:', error);
      return 0;
    }
  }

  /**
   * Get OTP expiry time remaining (in seconds)
   */
  async getOTPExpiryRemaining(identifier: string): Promise<number> {
    if (!this.redis) return 0;

    try {
      const key = this.getOTPKey(identifier);
      const ttl = await this.redis.ttl(key);
      return Math.max(0, ttl);
    } catch (error) {
      this.logger.error('OTP expiry check error:', error);
      return 0;
    }
  }
}
