import { Injectable, Logger, Optional } from '@nestjs/common';
import { OtpService } from '../../services/auth/otp.service';
import type { CacheSyncMessage } from './cache-sync.types';

const RECENT_BUFFER_MAX = 20;
const RECENT_BUFFER_TTL_SECONDS = 3600; // 1 hour
const REDIS_KEY_PREFIX = 'cache-sync:recent:';

/**
 * Maintains a bounded list of recent CacheSyncMessages per channel for catch-up on SSE (re)connect.
 * Uses Redis when available (LPUSH + LTRIM), otherwise in-memory per process.
 */
@Injectable()
export class CacheSyncRecentBufferService {
  private readonly logger = new Logger(CacheSyncRecentBufferService.name);
  private readonly memoryBuffer = new Map<string, CacheSyncMessage[]>();

  constructor(@Optional() private readonly otpService?: OtpService) {}

  private isRedisAvailable(): boolean {
    return !!this.otpService?.redis;
  }

  private redisKey(channelId: string): string {
    return `${REDIS_KEY_PREFIX}${channelId}`;
  }

  /**
   * Append a message to the buffer for its channel; cap at RECENT_BUFFER_MAX.
   */
  async push(msg: CacheSyncMessage): Promise<void> {
    const { channelId } = msg;
    if (!channelId) return;

    if (this.isRedisAvailable() && this.otpService!.redis) {
      try {
        const key = this.redisKey(channelId);
        const serialized = JSON.stringify(msg);
        await this.otpService!.redis.lpush(key, serialized);
        await this.otpService!.redis.ltrim(key, 0, RECENT_BUFFER_MAX - 1);
        await this.otpService!.redis.expire(key, RECENT_BUFFER_TTL_SECONDS);
        return;
      } catch (err) {
        this.logger.warn(
          `CacheSync buffer Redis push failed, falling back to memory: ${err instanceof Error ? err.message : String(err)}`
        );
        // fall through to memory
      }
    }

    const list = this.memoryBuffer.get(channelId) ?? [];
    list.unshift(msg);
    const trimmed = list.slice(0, RECENT_BUFFER_MAX);
    this.memoryBuffer.set(channelId, trimmed);
  }

  /**
   * Return up to RECENT_BUFFER_MAX messages for the channel in chronological order (oldest first).
   */
  async getRecent(channelId: string): Promise<CacheSyncMessage[]> {
    if (!channelId) return [];

    if (this.isRedisAvailable() && this.otpService!.redis) {
      try {
        const key = this.redisKey(channelId);
        const raw = await this.otpService!.redis.lrange(key, 0, -1);
        const parsed: CacheSyncMessage[] = [];
        for (const s of raw) {
          try {
            parsed.push(JSON.parse(s) as CacheSyncMessage);
          } catch {
            // skip malformed entry
          }
        }
        // Redis list is newest-first (from LPUSH); reverse for oldest-first
        return parsed.reverse();
      } catch (err) {
        this.logger.warn(
          `CacheSync buffer Redis getRecent failed, falling back to memory: ${err instanceof Error ? err.message : String(err)}`
        );
        // fall through to memory
      }
    }

    const list = this.memoryBuffer.get(channelId) ?? [];
    // memory: we stored newest first (unshift), so copy and reverse for oldest-first
    return [...list].reverse();
  }
}
