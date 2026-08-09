import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable, from, switchMap } from 'rxjs';
import { Permission, PermissionsService } from './permissions.service';
import { SupabaseService } from './supabase.service';

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** Preload only explicitly hot routes and respect browser bandwidth hints. */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  private readonly permissions = inject(PermissionsService);
  private readonly supabase = inject(SupabaseService);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['preload'] || !this.supabase.offlineIdentity() || this.shouldConserveData())
      return EMPTY;
    const permission = route.data['permission'] as Permission | undefined;
    if (!permission) return load();
    return from(this.permissions.ensureLoaded()).pipe(
      switchMap(() => (this.permissions.has(permission) ? load() : EMPTY))
    );
  }

  private shouldConserveData(): boolean {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    return (
      connection?.saveData === true || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    );
  }
}
