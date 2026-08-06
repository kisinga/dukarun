import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type AuditEvent = Database['public']['Functions']['list_audit_events']['Returns'][number];
export type AuditActor = Database['public']['Functions']['list_audit_actors']['Returns'][number];

export interface AuditFilters {
  search: string;
  action: string;
  area: string;
  actor: string;
  from: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly supabase = inject(SupabaseService);

  async events(filters: AuditFilters, page: number, pageSize: number): Promise<AuditEvent[]> {
    const { data, error } = await this.supabase.client.rpc('list_audit_events', {
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      ...(filters.search ? { p_search: filters.search } : {}),
      ...(filters.action ? { p_action: filters.action } : {}),
      ...(filters.area ? { p_area: filters.area } : {}),
      ...(filters.actor ? { p_actor: filters.actor } : {}),
      ...(filters.from ? { p_from: filters.from } : {}),
    });
    if (error) throw error;
    return data;
  }

  async actors(): Promise<AuditActor[]> {
    const { data, error } = await this.supabase.client.rpc('list_audit_actors');
    if (error) throw error;
    return data;
  }
}
