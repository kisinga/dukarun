import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService, type AppIdentity } from './supabase.service';
import { offlineDb, offlineScopeKey, type NamedSnapshot } from '../pos/offline/offline-db';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { CacheJournalService, type CacheStreamHandler } from './cache-journal.service';

export interface BusinessLocation {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  is_primary: boolean;
}

/**
 * Working-location context. One location is automatic and invisible; a choice
 * is persisted only when the user can access more than one.
 */
@Injectable({ providedIn: 'root' })
export class LocationContextService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly journal = inject(CacheJournalService);

  readonly locations = signal<BusinessLocation[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly active = computed(
    () => this.locations().find(location => location.id === this.activeId()) ?? null
  );
  readonly isMultiLocation = computed(() => this.locations().length > 1);

  private loadPromise: Promise<void> | null = null;
  private loadingFor: string | null = null;
  /** Identity scope the current locations list was loaded for. */
  private loadedFor: string | null = null;
  private channels: RealtimeChannel[] = [];
  private handler: CacheStreamHandler | null = null;

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const online = this.connectivity.online();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity) : null;
        if (scope !== this.loadedFor) {
          for (const channel of this.channels) void this.supabase.client.removeChannel(channel);
          this.channels = [];
          this.handler = null;
          this.locations.set([]);
          this.activeId.set(null);
          this.loadedFor = null;
          if (identity && scope) void this.startLoad(identity, scope).catch(() => undefined);
        }
        if (online && scope && this.handler) {
          void this.journal.reconcile('settings', scope, this.handler, 'locations-settings');
          void this.journal.reconcile('team', scope, this.handler, 'locations-team');
        }
      });
    });
  }

  /**
   * Idempotent: concurrent callers share one in-flight RPC, and repeat calls
   * for the same identity short-circuit once a list is loaded. Route guards
   * await this so pages never read activeId before it is resolved.
   */
  load(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity) {
      this.locations.set([]);
      this.activeId.set(null);
      this.loadedFor = null;
      return Promise.resolve();
    }
    const scope = `${identity.companyId}:${identity.userId}`;
    if (this.loadedFor === scope && this.locations().length > 0) return Promise.resolve();
    return this.startLoad(identity, scope);
  }

  private startLoad(identity: AppIdentity, scope: string): Promise<void> {
    if (this.loadPromise && this.loadingFor === scope) return this.loadPromise;
    const load = this.restoreAndWatch(identity, scope).finally(() => {
      if (this.loadPromise === load) {
        this.loadPromise = null;
        this.loadingFor = null;
      }
    });
    this.loadPromise = load;
    this.loadingFor = scope;
    return load;
  }

  private async doLoad(identity: AppIdentity, scope: string): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('accessible_business_locations');
      if (error) throw error;
      // Discard the result if the account/company changed mid-flight.
      const current = this.supabase.offlineIdentity();
      if (!current || `${current.companyId}:${current.userId}` !== scope) return;
      const locations = (data ?? []) as BusinessLocation[];
      this.locations.set(locations);
      this.loadedFor = scope;
      const stored = localStorage.getItem(this.storageKey(identity.companyId, identity.userId));
      const selected =
        locations.find(location => location.id === stored) ??
        locations.find(location => location.is_primary) ??
        locations.find(location => location.is_default) ??
        locations[0] ??
        null;
      this.activeId.set(selected?.id ?? null);
      if (selected)
        localStorage.setItem(this.storageKey(identity.companyId, identity.userId), selected.id);
      const snapshot: NamedSnapshot = {
        key: `${scope}:locations`,
        name: 'locations',
        company_id: identity.companyId,
        user_id: identity.userId,
        value: locations,
        fetched_at: new Date().toISOString(),
      };
      await (await offlineDb()).put('snapshots', snapshot);
    } finally {
      this.loading.set(false);
    }
  }

  select(locationId: string): void {
    const location = this.locations().find(item => item.id === locationId);
    const identity = this.supabase.offlineIdentity();
    if (!location || !identity) return;
    this.activeId.set(location.id);
    localStorage.setItem(this.storageKey(identity.companyId, identity.userId), location.id);
  }

  requireActiveId(): string {
    const id = this.activeId();
    if (!id) throw new Error('No accessible business location is configured.');
    return id;
  }

  private storageKey(companyId: string, userId: string): string {
    return `dukarun:working-location:${companyId}:${userId}`;
  }

  private async restoreAndWatch(identity: AppIdentity, scope: string): Promise<void> {
    const cached = await (await offlineDb()).get('snapshots', `${scope}:locations`);
    const currentIdentity = this.supabase.offlineIdentity();
    if (cached && currentIdentity && offlineScopeKey(currentIdentity) === scope) {
      const locations = cached.value as BusinessLocation[];
      this.locations.set(locations);
      this.loadedFor = scope;
      const stored = localStorage.getItem(this.storageKey(identity.companyId, identity.userId));
      const selected =
        locations.find(location => location.id === stored) ??
        locations.find(location => location.is_primary) ??
        locations.find(location => location.is_default) ??
        locations[0] ??
        null;
      this.activeId.set(selected?.id ?? null);
    }
    const activeIdentity = this.supabase.offlineIdentity();
    if (!activeIdentity || offlineScopeKey(activeIdentity) !== scope) return;
    this.handler = {
      apply: async changes => {
        if (
          changes.some(
            change =>
              change.entityType === 'location' ||
              change.entityType === 'membership' ||
              change.entityType === 'role'
          )
        ) {
          await this.doLoad(identity, scope);
        }
      },
      reset: async () => {
        await this.doLoad(identity, scope);
        return true;
      },
    };
    this.channels = [
      this.journal.subscribe(
        'settings',
        scope,
        identity.companyId,
        this.handler,
        'locations-settings'
      ),
      this.journal.subscribe('team', scope, identity.companyId, this.handler, 'locations-team'),
    ];
    if (!cached && this.connectivity.online()) await this.doLoad(identity, scope);
  }
}
