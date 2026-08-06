import { Injectable, Logger, Optional } from '@nestjs/common';
import { OtpService } from '../../services/auth/otp.service';

/**
 * Redis Cache Service
 *
 * Generic, reusable Redis cache service that can be used by any service.
 * Uses the existing Redis connection from OTP service to avoid duplication.
 *
 * Features:
 * - Automatic fallback to in-memory cache if Redis unavailable
 * - Type-safe get/set operations with JSON serialization
 * - Automatic key prefixing for namespacing
 * - TTL support via Redis SETEX
 * - Graceful error handling that never blocks operations
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly memoryCache = new Map<string, { value: any; expiresAt: number }>();

  constructor(@Optional() private readonly otpService?: OtpService) {}

  /**
   * Get cache key with namespace prefix
   */
  private getCacheKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Check if Redis is available
   */
  private isRedisAvailable(): boolean {
    return (
      this.otpService !== null &&
      this.otpService !== undefined &&
      this.otpService.redis !== null &&
      this.otpService.redis !== undefined
    );
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    const cacheKey = this.getCacheKey(namespace, key);

    if (this.isRedisAvailable() && this.otpService) {
      try {
        const serialized = JSON.stringify(value);
        await this.otpService.redis!.setex(cacheKey, ttlSeconds, serialized);
        return;
      } catch (error) {
        this.logger.warn(
          `Redis set failed for ${cacheKey}, falling back to memory: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to memory cache
      }
    }

    // Fallback to in-memory cache
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.memoryCache.set(cacheKey, { value, expiresAt });
  }

  /**
   * Set value only if the key does not already exist. Returns `true` if the key
   * was set, `false` if it already existed.
   */
  async setnx<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<boolean> {
    const cacheKey = this.getCacheKey(namespace, key);

    if (this.isRedisAvailable() && this.otpService) {
      try {
        const serialized = JSON.stringify(value);
        // Atomic SET EX NX: a losing call returns null instead of refreshing TTL.
        const result = await this.otpService.redis!.set(
          cacheKey,
          serialized,
          'EX',
          ttlSeconds,
          'NX'
        );
        return result === 'OK';
      } catch (error) {
        this.logger.error(
          `Redis setnx failed for ${cacheKey}; failing closed: ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      }
    }

    // Without Redis we cannot make a cross-process claim. Failing closed prevents
    // duplicate transitions; callers should retry on the next tick/interval.
    return false;
  }

  /**
   * Get value from cache
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    const cacheKey = this.getCacheKey(namespace, key);

    if (this.isRedisAvailable() && this.otpService) {
      try {
        const data = await this.otpService.redis!.get(cacheKey);
        if (!data) {
          return null;
        }

        try {
          return JSON.parse(data) as T;
        } catch (parseError) {
          this.logger.warn(`Failed to parse cached value for ${cacheKey}, returning null`);
          // Delete corrupted entry
          await this.otpService.redis!.del(cacheKey).catch(() => {
            // Ignore delete errors
          });
          return null;
        }
      } catch (error) {
        this.logger.warn(
          `Redis get failed for ${cacheKey}, falling back to memory: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to memory cache
      }
    }

    // Fallback to in-memory cache
    const entry = this.memoryCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(cacheKey);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Delete value from cache
   */
  async delete(namespace: string, key: string): Promise<void> {
    const cacheKey = this.getCacheKey(namespace, key);

    if (this.isRedisAvailable() && this.otpService) {
      try {
        await this.otpService.redis!.del(cacheKey);
        return;
      } catch (error) {
        this.logger.warn(
          `Redis delete failed for ${cacheKey}, falling back to memory: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to memory cache
      }
    }

    // Fallback to in-memory cache
    this.memoryCache.delete(cacheKey);
  }

  /**
   * Check if key exists in cache
   */
  async exists(namespace: string, key: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(namespace, key);

    if (this.isRedisAvailable() && this.otpService) {
      try {
        const result = await this.otpService.redis!.exists(cacheKey);
        return result === 1;
      } catch (error) {
        this.logger.warn(
          `Redis exists check failed for ${cacheKey}, falling back to memory: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall through to memory cache
      }
    }

    // Fallback to in-memory cache
    const entry = this.memoryCache.get(cacheKey);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(cacheKey);
      return false;
    }

    return true;
  }
}
