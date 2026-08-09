import { Injectable, inject } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  cacheWatermarkKey,
  offlineDb,
  type CacheStream,
  type CacheWatermark,
} from '../pos/offline/offline-db';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { SupabaseService, type AppIdentity } from './supabase.service';

export interface CacheChange {
  sequence: number;
  entityType: string;
  entityId: string;
  operation: 'upsert' | 'delete' | 'reset';
  locationId: string | null;
  userId: string | null;
  changedAt: string;
}

interface CacheSyncResponse {
  stream: CacheStream;
  headSequence: number;
  prunedThroughSequence: number;
  resetRequired: boolean;
  nextSequence: number;
  hasMore: boolean;
  changes: CacheChange[];
}

export interface CacheStreamHandler {
  /** Patch the projection and IndexedDB. Resolve only once persistence succeeds. */
  apply(changes: readonly CacheChange[]): Promise<void>;
  /** Rebuild the stream projection and IndexedDB after a retention gap/reset. */
  reset(): Promise<boolean>;
  /** Immediately discard live state before a permission-sensitive rebuild. */
  purge?(): Promise<void> | void;
}

interface RegisteredHandler {
  stream: CacheStream;
  scope: string;
  consumer: string;
  handler: CacheStreamHandler;
}

/**
 * Realtime is only a low-latency wake-up. sync_cache_stream is the durable,
 * ordered source of invalidations and heals events missed while disconnected.
 */
@Injectable({ providedIn: 'root' })
export class CacheJournalService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly running = new Map<string, Promise<void>>();
  private readonly pending = new Set<string>();
  private readonly retryAttempts = new Map<string, number>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly forcedResets = new Set<string>();

  subscribe(
    stream: CacheStream,
    scope: string,
    companyId: string,
    handler: CacheStreamHandler,
    consumer: string,
    onStatus?: (status: string) => void
  ): RealtimeChannel {
    this.handlers.set(`${stream}:${consumer}`, { stream, scope, consumer, handler });
    const channel = this.supabase.client
      .channel(`cache:${stream}:${consumer}:${scope}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cache_change_log',
          filter: `company_id=eq.${companyId}`,
        },
        payload => {
          if (payload.new['stream'] === stream)
            void this.reconcile(stream, scope, handler, consumer);
        }
      )
      .subscribe(status => {
        onStatus?.(status);
        // Subscribe first, then reconcile. Any write racing the sync produces
        // another wake-up and is recovered from the same ordered journal.
        if (status === 'SUBSCRIBED') void this.reconcile(stream, scope, handler, consumer);
      });
    return channel;
  }

  /** Stop reconciliation work when a consumer tears down its Realtime channel. */
  unsubscribe(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string
  ): void {
    const registrationKey = `${stream}:${consumer}`;
    const registration = this.handlers.get(registrationKey);
    if (registration?.scope !== scope || registration.handler !== handler) return;
    this.handlers.delete(registrationKey);

    const reconcileKey = `${scope}:${stream}:${consumer}`;
    this.pending.delete(reconcileKey);
    this.forcedResets.delete(reconcileKey);
    this.retryAttempts.delete(reconcileKey);
    const retryTimer = this.retryTimers.get(reconcileKey);
    if (retryTimer) clearTimeout(retryTimer);
    this.retryTimers.delete(reconcileKey);
  }

  reconcile(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string
  ): Promise<void> {
    if (!this.connectivity.online() || !this.isRegistered(stream, scope, handler, consumer)) {
      return Promise.resolve();
    }
    const key = `${scope}:${stream}:${consumer}`;
    const retryTimer = this.retryTimers.get(key);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(key);
    }
    const active = this.running.get(key);
    if (active) {
      this.pending.add(key);
      return active;
    }

    const run = this.reconcileLoop(stream, scope, handler, consumer)
      .then(() => {
        this.retryAttempts.delete(key);
      })
      .catch(() => this.scheduleRetry(stream, scope, handler, consumer, key))
      .finally(() => {
        this.running.delete(key);
        if (!this.pending.delete(key)) return;
        const registration = this.handlers.get(`${stream}:${consumer}`);
        if (registration?.scope === scope) {
          void this.reconcile(stream, scope, registration.handler, consumer);
        }
      });
    this.running.set(key, run);
    return run;
  }

  private scheduleRetry(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string,
    key: string
  ): void {
    if (
      !this.connectivity.online() ||
      !this.scopeIsCurrent(scope) ||
      !this.isRegistered(stream, scope, handler, consumer)
    )
      return;
    const attempt = this.retryAttempts.get(key) ?? 0;
    const delays = [1_000, 3_000, 10_000, 30_000, 60_000];
    if (this.retryTimers.has(key)) return;
    const delayIndex = Math.min(attempt, delays.length - 1);
    this.retryAttempts.set(key, Math.min(attempt + 1, delays.length - 1));
    const timer = setTimeout(() => {
      this.retryTimers.delete(key);
      if (
        this.connectivity.online() &&
        this.scopeIsCurrent(scope) &&
        this.isRegistered(stream, scope, handler, consumer)
      ) {
        void this.reconcile(stream, scope, handler, consumer);
      }
    }, delays[delayIndex]);
    this.retryTimers.set(key, timer);
  }

  private scopeIsCurrent(scope: string): boolean {
    const identity = this.supabase.offlineIdentity();
    return !!identity && scope.startsWith(`${identity.companyId}:${identity.userId}`);
  }

  private isRegistered(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string
  ): boolean {
    const registration = this.handlers.get(`${stream}:${consumer}`);
    return registration?.scope === scope && registration.handler === handler;
  }

  private async reconcileLoop(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string
  ): Promise<void> {
    const key = `${scope}:${stream}:${consumer}`;
    do {
      this.pending.delete(key);
      await this.syncPages(stream, scope, handler, consumer);
    } while (
      this.pending.has(key) &&
      this.connectivity.online() &&
      this.isRegistered(stream, scope, handler, consumer)
    );
  }

  private async syncPages(
    stream: CacheStream,
    scope: string,
    handler: CacheStreamHandler,
    consumer: string
  ): Promise<void> {
    const db = await offlineDb();
    const watermarkKey = cacheWatermarkKey(`${scope}:consumer:${consumer}`, stream);
    const reconcileKey = `${scope}:${stream}:${consumer}`;
    let sequence = (await db.get('watermarks', watermarkKey))?.sequence ?? 0;

    while (this.connectivity.online() && this.isRegistered(stream, scope, handler, consumer)) {
      const { data, error } = await this.supabase.client.rpc('sync_cache_stream', {
        p_stream: stream,
        p_after_sequence: sequence,
        p_limit: 512,
      });
      if (error) throw error;
      const response = data as unknown as CacheSyncResponse;
      const forcedReset = this.forcedResets.has(reconcileKey);
      const reset =
        forcedReset ||
        response.resetRequired ||
        response.changes.some(row => row.operation === 'reset');

      if (reset) {
        if (!(await handler.reset())) throw new Error(`Could not reset ${stream} cache`);
        this.forcedResets.delete(reconcileKey);
        sequence = response.headSequence;
      } else {
        const changes = foldChanges(response.changes);
        if (changes.length) await handler.apply(changes);
        sequence = response.nextSequence;
      }

      const identity = this.supabase.offlineIdentity();
      if (
        !identity ||
        !scope.startsWith(`${identity.companyId}:${identity.userId}`) ||
        !this.isRegistered(stream, scope, handler, consumer)
      )
        return;
      const watermark: CacheWatermark = {
        key: watermarkKey,
        company_id: identity.companyId,
        user_id: identity.userId,
        stream,
        sequence,
        updated_at: new Date().toISOString(),
      };
      await db.put('watermarks', watermark);
      if (!response.hasMore || reset) return;
    }
  }

  /** Remove snapshots whose visibility can change with role/company context. */
  async purgeSensitive(identity: AppIdentity): Promise<void> {
    const db = await offlineDb();
    const sensitiveStreams = new Set<CacheStream>([
      'parties',
      'sales',
      'settings',
      'inbox',
      'team',
    ]);
    const stores = [
      'parties',
      'cashier',
      'settings',
      'recentSales',
      'saleDetails',
      'snapshots',
    ] as const;
    for (const storeName of stores) {
      const tx = db.transaction(storeName, 'readwrite');
      let cursor = await tx.store.openCursor();
      while (cursor) {
        const value = cursor.value as { company_id?: string; user_id?: string };
        if (value.company_id === identity.companyId && value.user_id === identity.userId) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    }

    const watermarkTx = db.transaction('watermarks', 'readwrite');
    let watermarkCursor = await watermarkTx.store.openCursor();
    while (watermarkCursor) {
      const value = watermarkCursor.value;
      if (
        value.company_id === identity.companyId &&
        value.user_id === identity.userId &&
        sensitiveStreams.has(value.stream)
      ) {
        await watermarkCursor.delete();
      }
      watermarkCursor = await watermarkCursor.continue();
    }
    await watermarkTx.done;

    const identityPrefix = `${identity.companyId}:${identity.userId}`;
    for (const registration of this.handlers.values()) {
      if (
        !registration.scope.startsWith(identityPrefix) ||
        !sensitiveStreams.has(registration.stream) ||
        // This method runs inside the permission journal consumer. Re-entering
        // that same handler would recurse; its current pass persists the new
        // authoritative access watermark after the purge completes.
        registration.consumer === 'permissions'
      ) {
        continue;
      }
      await registration.handler.purge?.();
      this.forcedResets.add(
        `${registration.scope}:${registration.stream}:${registration.consumer}`
      );
      void this.reconcile(
        registration.stream,
        registration.scope,
        registration.handler,
        registration.consumer
      );
    }
  }
}

/** Keep only the final operation for each projection key in a journal page. */
function foldChanges(changes: readonly CacheChange[]): CacheChange[] {
  const folded = new Map<string, CacheChange>();
  for (const change of changes) {
    if (change.operation === 'reset') return [change];
    folded.set(
      `${change.entityType}:${change.entityId}:${change.locationId ?? ''}:${change.userId ?? ''}`,
      change
    );
  }
  return [...folded.values()].sort((a, b) => a.sequence - b.sequence);
}
