import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService, type AppIdentity } from './supabase.service';

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

  readonly locations = signal<BusinessLocation[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly active = computed(
    () => this.locations().find(location => location.id === this.activeId()) ?? null
  );
  readonly isMultiLocation = computed(() => this.locations().length > 1);

  private loadPromise: Promise<void> | null = null;
  /** Identity scope the current locations list was loaded for. */
  private loadedFor: string | null = null;

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
    this.loadPromise ??= this.doLoad(identity, scope).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
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
}
