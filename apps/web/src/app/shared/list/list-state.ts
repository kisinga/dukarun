import { PartyCacheService } from '../../core/party-cache.service';
import { CatalogCacheService } from '../../core/catalog-cache.service';
import { Injectable, effect, inject } from '@angular/core';
import {
  ALL_PERMISSIONS,
  PermissionsService,
  WORKSPACE_ACCESS_KEYS,
} from '../../core/permissions.service';
import { SupabaseService } from '../../core/supabase.service';
import { LocationContextService } from '../../core/location-context.service';

/** URL parameter ordering is irrelevant to the identity of a list view. */
export function canonicalListUrl(url: string): string {
  const parsed = new URL(url, 'https://list.local');
  parsed.searchParams.sort();
  return parsed.pathname + (parsed.search ? parsed.search : '');
}

export interface ListReturnPosition {
  y: number;
  x: number[];
  anchor?: string;
  offset?: number;
  neighbors: string[];
}

export function nearestSavedRecord(
  saved: ListReturnPosition,
  surviving: ReadonlySet<string>
): string | undefined {
  if (saved.anchor && surviving.has(saved.anchor)) return saved.anchor;
  return saved.neighbors.find(key => surviving.has(key));
}

/** Same-session snapshots only. Domain stores remain authoritative. */
@Injectable({ providedIn: 'root' })
export class ListStateService {
  private readonly auth = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly permissions = inject(PermissionsService);
  private readonly catalog = inject(CatalogCacheService);
  private readonly parties = inject(PartyCacheService);
  private scope = '';
  private readonly rows = new Map<string, unknown>();
  private readonly positions = new Map<string, ListReturnPosition>();

  constructor() {
    effect(() => this.syncScope());
    effect(() => {
      this.catalog.revision();
      this.parties.revision();
      this.rows.clear();
    });
  }

  private syncScope(): string {
    const identity = this.auth.offlineIdentity();
    const scope = identity
      ? JSON.stringify([
          identity.companyId,
          identity.userId,
          this.locations.activeId(),
          ALL_PERMISSIONS.filter(permission => this.permissions.has(permission)),
          WORKSPACE_ACCESS_KEYS.filter(workspace => this.permissions.canAccessWorkspace(workspace)),
        ])
      : '';
    if (scope !== this.scope) {
      this.rows.clear();
      this.positions.clear();
      this.scope = scope;
    }
    return scope;
  }

  read<T>(url: string): T | undefined {
    this.syncScope();
    return this.rows.get(canonicalListUrl(url)) as T | undefined;
  }

  scopeToken(): string {
    return JSON.stringify([this.syncScope(), this.catalog.revision(), this.parties.revision()]);
  }

  save<T>(url: string, data: T, expectedScope: string): void {
    if (!this.syncScope() || expectedScope !== this.scopeToken()) return;
    const key = canonicalListUrl(url);
    this.rows.delete(key);
    this.rows.set(key, data);
    // Bound memory when users explore many views; never write business rows to storage.
    if (this.rows.size > 20) this.rows.delete(this.rows.keys().next().value!);
  }

  invalidate(listPath?: string): void {
    for (const key of this.rows.keys())
      if (!listPath || key.split('?')[0] === listPath) this.rows.delete(key);
  }

  capture(url: string, surface: HTMLElement): void {
    if (!this.syncScope()) return;
    const records = Array.from(surface.querySelectorAll<HTMLElement>('[data-list-record]')).filter(
      row => row.getClientRects().length
    );
    const index = records.findIndex(row => row.getBoundingClientRect().bottom > 112);
    const anchor = records[index];
    const neighbors = records
      .map((row, i) => ({ id: row.dataset['listRecord']!, distance: Math.abs(i - index) }))
      .sort((a, b) => a.distance - b.distance)
      .map(row => row.id);
    this.positions.set(canonicalListUrl(url), {
      y: window.scrollY,
      x: Array.from(surface.querySelectorAll<HTMLElement>('.data-table-viewport')).map(
        element => element.scrollLeft
      ),
      anchor: anchor?.dataset['listRecord'],
      offset: anchor?.getBoundingClientRect().top,
      neighbors,
    });
    if (this.positions.size > 40) this.positions.delete(this.positions.keys().next().value!);
  }

  restore(url: string, surface: HTMLElement): boolean {
    this.syncScope();
    const saved = this.positions.get(canonicalListUrl(url));
    if (!saved) return true;
    const records = Array.from(surface.querySelectorAll<HTMLElement>('[data-list-record]')).filter(
      row => row.getClientRects().length
    );
    if (!records.length && !surface.querySelector('app-empty-state, [role="alert"]')) return false;
    const key = nearestSavedRecord(saved, new Set(records.map(row => row.dataset['listRecord']!)));
    const anchor = records.find(row => row.dataset['listRecord'] === key);
    const y = anchor
      ? window.scrollY + anchor.getBoundingClientRect().top - (saved.offset ?? 112)
      : saved.y;
    window.scrollTo({
      top: Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight)),
      behavior: 'instant',
    });
    surface.querySelectorAll<HTMLElement>('.data-table-viewport').forEach((element, index) => {
      element.scrollLeft = saved.x[index] ?? 0;
    });
    return !!anchor || surface.querySelector('[role="status"], .loading') === null;
  }
}
