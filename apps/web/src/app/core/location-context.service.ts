import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

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

  async load(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity) {
      this.locations.set([]);
      this.activeId.set(null);
      return;
    }
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('accessible_business_locations');
      if (error) throw error;
      const locations = (data ?? []) as BusinessLocation[];
      this.locations.set(locations);
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
