import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/** One row of the my_companies RPC: an approved membership with company info. */
export interface CompanyMembership {
  company_id: string;
  name: string;
  code: string;
  role_name: string;
  is_active: boolean;
}

/**
 * Multi-company context. The ACTIVE company lives in the JWT company_id claim
 * (all RLS/RPC scoping reads it); this service only lists the user's companies
 * and switches the preference that the token hook resolves on the next issue.
 * Switching ends in a full reload so every cached store restarts under the
 * new tenant scope.
 */
@Injectable({ providedIn: 'root' })
export class CompanyContextService {
  private readonly supabase = inject(SupabaseService);

  readonly companies = signal<CompanyMembership[]>([]);
  readonly switching = signal(false);
  readonly isMultiCompany = computed(() => this.companies().length > 1);

  private loadedFor: string | null = null;

  /** Idempotent per user: repeat calls within a session cost nothing. */
  async load(): Promise<void> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) {
      this.companies.set([]);
      this.loadedFor = null;
      return;
    }
    if (this.loadedFor === userId) return;
    const { data, error } = await this.supabase.client.rpc('my_companies');
    if (error) throw error;
    // Discard if the account changed mid-flight.
    if (this.supabase.session()?.user.id !== userId) return;
    this.companies.set(data ?? []);
    this.loadedFor = userId;
  }

  /**
   * Persist the active company, force a new token (the hook re-runs and
   * injects its claims), then reload into the dashboard under the new scope.
   */
  async switchCompany(companyId: string): Promise<void> {
    if (this.switching()) return;
    const userId = this.supabase.session()?.user.id;
    if (!userId) throw new Error('Sign in again to switch companies.');
    this.switching.set(true);
    try {
      const { error } = await this.supabase.client
        .from('user_preferences')
        .upsert({ user_id: userId, active_company_id: companyId });
      if (error) throw error;
      const { error: refreshError } = await this.supabase.client.auth.refreshSession();
      if (refreshError) throw refreshError;
      window.location.assign('/dashboard');
    } finally {
      this.switching.set(false);
    }
  }
}
