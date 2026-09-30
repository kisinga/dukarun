import { ServerClockService } from './server-clock.service';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService, type AppIdentity } from './supabase.service';
import { offlineDb, offlineScopeKey } from '../pos/offline/offline-db';
import { LocationContextService } from './location-context.service';
import { CompanyPreferencesService } from './company-preferences.service';
import { CacheJournalService, type CacheStreamHandler } from './cache-journal.service';
import {
  confirmedOfflineTime,
  offlineDeviceKey,
  type OfflineCapture,
  type OfflineConfirmation,
  type OfflineContext,
} from '../pos/offline/offline-contract';

type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];

/** One source of truth for the company till across the authenticated app. */
@Injectable({ providedIn: 'root' })
export class CashierSessionService {
  private readonly clock = inject(ServerClockService);
  private readonly preferences = inject(CompanyPreferencesService);
  readonly session = signal<CashierSession | null>(null);
  readonly loading = signal(false);
  readonly isOpen = computed(() => this.session() !== null);
  readonly cashierFlowEnabled = this.preferences.cashierFlowEnabled;
  readonly cashControlEnabled = this.preferences.cashControlEnabled;
  readonly configurationLoaded = this.preferences.loaded;
  readonly canTakePayment = computed(
    () =>
      this.isOpen() &&
      (this.confirmation() ? this.cachedSessionIsCurrent() : !this.usingCachedState())
  );
  private readonly confirmation = signal<OfflineConfirmation | null>(null);
  readonly usingCachedState = signal(false);
  readonly lastConfirmedAt = signal<string | null>(null);

  private started = false;
  private activeScope: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private channel: RealtimeChannel | null = null;
  private handler: CacheStreamHandler | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly locations: LocationContextService,
    private readonly journal: CacheJournalService
  ) {}

  async start(): Promise<void> {
    const identity = await this.activateScope();
    if (!identity) return;
    await this.refreshConfiguration();
    if (this.started) {
      try {
        await this.refresh();
      } catch {
        // Journal reconciliation will retry; keep the last confirmed state.
      }
      return;
    }
    this.started = true;
    try {
      await this.refresh();
    } catch {
      // A transient startup failure must not prevent later refreshes.
    }

    const scope = this.activeScope;
    if (!scope) return;
    this.handler = {
      apply: async changes => {
        const locationId = this.locations.activeId();
        if (
          changes.some(
            change =>
              change.entityType === 'cashier_session' &&
              (!change.locationId || change.locationId === locationId)
          )
        ) {
          await this.refresh();
        }
      },
      reset: async () => {
        await this.refresh();
        return true;
      },
    };
    this.channel = this.journal.subscribe(
      'settings',
      scope,
      identity.companyId,
      this.handler,
      'cashier-session'
    );
  }

  async refreshConfiguration(): Promise<void> {
    await this.preferences.refresh();
  }

  async refresh(): Promise<void> {
    const identity = await this.activateScope();
    if (!identity) throw new Error('Sign in again to confirm the cashier session.');
    if (!this.configurationLoaded()) await this.refreshConfiguration();
    if (this.refreshPromise) return this.refreshPromise;
    // Only the first load (nothing confirmed yet) drives the UI spinner.
    // Background polls and realtime-triggered refreshes must be silent —
    // otherwise the header till button flickers "Checking till" every cycle.
    const silent = this.session() !== null || this.lastConfirmedAt() !== null;
    if (!silent) this.loading.set(true);
    const locationId = this.locations.requireActiveId();
    const key = offlineScopeKey(identity, locationId);
    this.refreshPromise = this.load(identity, key)
      .catch(async error => {
        if (this.session() && this.cachedSessionIsCurrent()) {
          this.usingCachedState.set(true);
        } else {
          this.session.set(null);
          this.confirmation.set(null);
          this.usingCachedState.set(false);
          this.lastConfirmedAt.set(null);
          const db = await offlineDb();
          await db.delete('cashier', key);
        }
        throw error;
      })
      .finally(() => {
        if (!silent) this.loading.set(false);
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  /** Re-check immediately before a governed action, then fail with useful copy. */
  async assertOpen(action: string): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // If offline, retain the last confirmed state. The database re-checks on sync.
    }
    if (!this.isOpen()) throw new Error(`Open a cashier session before ${action}.`);
    if (!this.canTakePayment())
      throw new Error(
        'Connect to the internet to renew your cashier session confirmation. Offline checkout pauses after 24 hours; your cart is kept.'
      );
  }

  cachedStatusLabel(): string {
    const confirmedAt = this.lastConfirmedAt();
    if (!confirmedAt) return 'Till status is cached';
    return `Till last confirmed ${new Date(confirmedAt).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  private async load(identity: AppIdentity, key: string): Promise<void> {
    const { data: response, error } = await this.supabase.client.rpc(
      'confirm_offline_sale_context',
      {
        p_location_id: this.locations.requireActiveId(),
        p_device_key: offlineDeviceKey(),
      }
    );
    const result = response as unknown as {
      session: CashierSession | null;
      context: OfflineContext | null;
      server_time: string;
    };
    const data = result?.session;
    if (error) throw error;
    if (this.activeScope !== key) return;
    this.clock.observe(result.server_time);
    this.session.set(data ?? null);
    this.confirmation.set(
      data && result.context
        ? {
            context: result.context,
            clock: this.clock.snapshot()!,
          }
        : null
    );
    this.usingCachedState.set(false);
    const db = await offlineDb();
    this.lastConfirmedAt.set(data ? result.server_time : null);
    if (data && this.confirmation()) {
      const confirmedAt = result.server_time;
      await db.put('cashier', {
        key,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: this.locations.requireActiveId(),
        session: data,
        confirmed_at: confirmedAt,
        confirmation: this.confirmation()!,
      });
    } else {
      // A live session read without sale permission is useful to money screens,
      // but must never become an offline checkout confirmation.
      await db.delete('cashier', key);
    }
  }

  private async activateScope(): Promise<AppIdentity | null> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    const key = identity && locationId ? offlineScopeKey(identity, locationId) : null;
    if (this.activeScope === key) return identity;
    if (this.refreshPromise) {
      try {
        await this.refreshPromise;
      } catch {
        // The old account's refresh is allowed to finish before switching.
      }
      return this.activateScope();
    }

    if (this.channel) void this.supabase.client.removeChannel(this.channel);
    this.channel = null;
    this.handler = null;
    this.started = false;
    this.activeScope = key;
    this.session.set(null);
    this.usingCachedState.set(false);
    this.lastConfirmedAt.set(null);
    this.confirmation.set(null);

    if (!identity || !locationId || !key) return null;
    try {
      const db = await offlineDb();
      const snapshot = await db.get('cashier', key);
      this.clock.restore(snapshot?.confirmation?.clock);
      if (
        snapshot &&
        snapshot.session.status === 'open' &&
        snapshot.session.company_id === identity.companyId &&
        snapshot.location_id === locationId &&
        snapshot.confirmation?.context.device_key === offlineDeviceKey() &&
        snapshot.confirmation.context.session_id === snapshot.session.id &&
        confirmedOfflineTime(snapshot.confirmation, this.clock.now()) !== null
      ) {
        this.confirmation.set(snapshot.confirmation);
        this.session.set(snapshot.session);
        this.usingCachedState.set(true);
        this.lastConfirmedAt.set(snapshot.confirmed_at);
      } else if (snapshot) {
        await db.delete('cashier', key);
      }
    } catch {
      // A missing/unavailable local snapshot fails closed.
    }
    return identity;
  }

  captureOfflineSale(): OfflineCapture {
    const time = confirmedOfflineTime(this.confirmation(), this.clock.now());
    const context = this.confirmation()?.context;
    if (
      time === null ||
      !context ||
      context.session_id !== this.session()?.id ||
      context.location_id !== this.locations.requireActiveId()
    ) {
      throw new Error(
        'Connect to confirm an open cashier session before taking another offline sale.'
      );
    }
    return {
      offline_context_id: context.id,
      originating_session_id: context.session_id,
      location_id: context.location_id,
      occurred_at: new Date(time).toISOString(),
      device_key: context.device_key,
    };
  }

  private cachedSessionIsCurrent(): boolean {
    return confirmedOfflineTime(this.confirmation(), this.clock.now()) !== null;
  }
}
