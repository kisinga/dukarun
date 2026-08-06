import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OtpService } from '../../services/auth/otp.service';
import { RegistrationInput } from '../../services/auth/registration.service';

/**
 * Registration Storage Service
 *
 * Handles temporary storage of registration data in Redis.
 * Data is stored before OTP request and retrieved after OTP verification.
 *
 * Architecture:
 * - Registration data is stored with a unique session ID
 * - Session ID is returned to frontend for OTP verification
 * - Data expires after 15 minutes (matching OTP expiry)
 * - Data is deleted after successful retrieval
 */
@Injectable()
export class RegistrationStorageService {
  private readonly logger = new Logger(RegistrationStorageService.name);
  private readonly STORAGE_PREFIX = 'registration:data:';
  private readonly STORAGE_EXPIRY_SECONDS = 15 * 60; // 15 minutes (matches OTP expiry + buffer)

  constructor(private readonly otpService: OtpService) {}

  /**
   * Store registration data temporarily
   * Returns a session ID that must be used during OTP verification
   */
  async storeRegistrationData(
    phoneNumber: string,
    registrationData: RegistrationInput
  ): Promise<{ sessionId: string; expiresAt: number }> {
    if (!this.otpService.redis) {
      throw new Error('Redis not available. Cannot store registration data.');
    }

    // Generate unique session ID (phone number + timestamp + crypto-random)
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sessionId = `${phoneNumber}:${timestamp}:${random}`;
    const storageKey = this.getStorageKey(sessionId);

    // Store registration data
    const data = JSON.stringify(registrationData);
    await this.otpService.redis.setex(storageKey, this.STORAGE_EXPIRY_SECONDS, data);

    const expiresAt = Date.now() + this.STORAGE_EXPIRY_SECONDS * 1000;

    this.logger.debug(
      `Stored registration data: ${sessionId}, Expires: ${new Date(expiresAt).toISOString()}`
    );

    return { sessionId, expiresAt };
  }

  /**
   * Retrieve and delete registration data
   * Returns null if data not found or expired
   */
  async retrieveRegistrationData(sessionId: string): Promise<RegistrationInput | null> {
    if (!this.otpService.redis) {
      throw new Error('Redis not available. Cannot retrieve registration data.');
    }

    const storageKey = this.getStorageKey(sessionId);
    const data = await this.otpService.redis.get(storageKey);

    if (!data) {
      this.logger.warn(`Registration data not found or expired: ${sessionId}`);
      return null;
    }

    // Delete data after retrieval (one-time use)
    await this.otpService.redis.del(storageKey);
    this.logger.debug(`Retrieved and deleted registration data: ${sessionId}`);

    try {
      return JSON.parse(data) as RegistrationInput;
    } catch (error) {
      this.logger.error('Failed to parse registration data:', error);
      return null;
    }
  }

  /**
   * Check if registration data exists (without retrieving)
   */
  async hasRegistrationData(sessionId: string): Promise<boolean> {
    if (!this.otpService.redis) {
      return false;
    }

    const storageKey = this.getStorageKey(sessionId);
    const exists = await this.otpService.redis.exists(storageKey);
    return exists === 1;
  }

  /**
   * Get Redis key for storage
   */
  private getStorageKey(sessionId: string): string {
    return `${this.STORAGE_PREFIX}${sessionId}`;
  }
}
