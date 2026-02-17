import { inject, Injectable, effect } from '@angular/core';
import { CompanyService } from '../company.service';
import type { CacheSyncEntityHandler } from './cache-sync-handler.interface';
import type { CacheSyncEntityType } from './cache-sync-handler.interface';

/** Delay before handling each SSE message (ms); set to 0 to disable. Used for validation flow visibility. */
const CACHE_SYNC_VALIDATION_DELAY_MS = 300;

/** Window (ms) after connect to collect catch-up messages before deduplicating and applying. */
const CATCH_UP_WINDOW_MS = 100;

/** Message shape from backend SSE; must match backend cache-sync.types.CacheSyncMessage */
interface CacheSyncMessage {
  entityType: CacheSyncEntityType;
  action: 'created' | 'updated' | 'deleted';
  channelId: string;
  id?: string;
}

/**
 * Keeps entity caches in sync with backend via the cache-sync SSE stream.
 * Uses a registry of CacheSyncEntityHandler; each entity cache registers and provides
 * hydrateOne/invalidateOne. On reconnect, catch-up events are deduplicated by (entityType, id)
 * so we only fetch each changed id once.
 */
@Injectable({
  providedIn: 'root',
})
export class CacheSyncService {
  private readonly companyService = inject(CompanyService);

  private readonly handlers = new Map<CacheSyncEntityType, CacheSyncEntityHandler>();

  private eventSource: EventSource | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private readonly maxBackoffMs = 30000;

  /** Catch-up phase: buffer messages after connect, then deduplicate and apply once. */
  private catchingUp = false;
  private catchUpBuffer: CacheSyncMessage[] = [];
  private catchUpFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const channelId = this.companyService.activeCompanyId();
      if (channelId) {
        this.connect(channelId);
      } else {
        this.disconnect();
      }
    });
  }

  registerHandler(handler: CacheSyncEntityHandler): void {
    this.handlers.set(handler.entityType, handler);
  }

  private disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimeout != null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.catchUpFlushTimeout != null) {
      clearTimeout(this.catchUpFlushTimeout);
      this.catchUpFlushTimeout = null;
    }
    this.catchingUp = false;
    this.catchUpBuffer = [];
    this.backoffMs = 1000;
  }

  private connect(channelId: string): void {
    this.disconnect();

    const channelToken = this.companyService.getChannelToken();
    const params = new URLSearchParams({ channelId });
    if (channelToken) {
      params.set('vendure-token', channelToken);
    }
    const url = `/admin-api/cache-sync/stream?${params.toString()}`;
    this.eventSource = new EventSource(url, { withCredentials: true });

    this.eventSource.onopen = () => {
      this.backoffMs = 1000;
      this.catchingUp = true;
      this.catchUpBuffer = [];
    };

    this.eventSource.onmessage = (e: MessageEvent) => {
      setTimeout(() => {
        try {
          const msg = JSON.parse(e.data) as CacheSyncMessage;
          console.log('[CacheSync] SSE event received', {
            entityType: msg.entityType,
            action: msg.action,
            channelId: msg.channelId,
            id: msg.id,
          });
          if (msg.channelId !== this.companyService.activeCompanyId()) return;

          if (this.catchingUp) {
            this.catchUpBuffer.push(msg);
            if (this.catchUpFlushTimeout == null) {
              this.catchUpFlushTimeout = setTimeout(() => {
                this.catchUpFlushTimeout = null;
                this.flushCatchUpBuffer(channelId);
              }, CATCH_UP_WINDOW_MS);
            }
            return;
          }

          this.applyMessage(msg);
        } catch {
          // ignore parse errors
        }
      }, CACHE_SYNC_VALIDATION_DELAY_MS);
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;
      this.check401AndReconnect(url, channelId);
    };
  }

  /**
   * Deduplicate by (entityType, id), keep latest action per id, then apply each once.
   */
  private flushCatchUpBuffer(channelId: string): void {
    this.catchingUp = false;
    const buffer = this.catchUpBuffer;
    this.catchUpBuffer = [];

    const byKey = new Map<string, CacheSyncMessage>();
    for (const msg of buffer) {
      const id = msg.id ?? '';
      const key = `${msg.entityType}:${id}`;
      byKey.set(key, msg);
    }

    for (const msg of byKey.values()) {
      this.applyMessage(msg);
    }
  }

  private applyMessage(msg: CacheSyncMessage): void {
    const handler = this.handlers.get(msg.entityType);
    if (!handler) return;
    const id = msg.id;
    if (id == null || id === '') return;

    if (msg.action === 'deleted') {
      if (handler.invalidateOne) {
        void Promise.resolve(handler.invalidateOne(msg.channelId, id));
      }
      return;
    }

    // created / updated
    if (handler.hydrateOne) {
      if (handler.has?.(msg.channelId, id)) return;
      void handler.hydrateOne(msg.channelId, id);
    } else if (handler.invalidateOne) {
      void Promise.resolve(handler.invalidateOne(msg.channelId, id));
    }
  }

  private check401AndReconnect(streamUrl: string, channelId: string): void {
    fetch(streamUrl, { method: 'GET', credentials: 'include' })
      .then((r) => {
        if (r.status === 401) {
          return;
        }
        this.scheduleReconnect(channelId);
      })
      .catch(() => {
        this.scheduleReconnect(channelId);
      });
  }

  private scheduleReconnect(channelId: string): void {
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.companyService.activeCompanyId() === channelId) {
        this.connect(channelId);
      }
    }, this.backoffMs);
    this.backoffMs = Math.min(this.maxBackoffMs, this.backoffMs * 2);
  }
}
