import { Injectable, computed, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';

/** Custom claims injected into the JWT by the custom_access_token_hook. */
export interface AppJwtClaims {
  company_id?: string;
  user_role?: string;
}

/** Stable browser-storage boundary for tenant and account scoped data. */
export interface AppIdentity {
  companyId: string;
  userId: string;
}

export interface TeamInvitationClaimResult {
  claimed_count: number;
  company_id: string | null;
}

export type Company = Pick<
  Database['public']['Tables']['companies']['Row'],
  'id' | 'name' | 'code'
>;

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  );

  readonly session = signal<Session | null>(null);
  private sessionLoad: Promise<Session | null> | null = null;
  private sessionRestoreFailed = false;
  readonly offlineIdentity = computed<AppIdentity | null>(() => {
    const session = this.session();
    if (!session) return null;
    const companyId = this.decodeClaims(session.access_token)?.company_id;
    return companyId ? { companyId, userId: session.user.id } : null;
  });

  constructor() {
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (session) this.sessionRestoreFailed = false;
    });
    void this.initializeSession().catch(() => undefined);
  }

  /**
   * Resolve persisted auth once, with a hard boundary so stale browser state
   * cannot hold Angular route activation forever.
   */
  initializeSession(timeoutMs = 10_000): Promise<Session | null> {
    if (this.sessionRestoreFailed) return Promise.resolve(null);
    if (this.sessionLoad) return this.sessionLoad;

    const load = this.client.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      let session = data.session;

      // A verified phone may have a team invitation waiting for it. Claim it
      // before refreshing so the token hook can issue the tenant claim in the
      // same session restoration pass. This also supports auth users created
      // before the invitation existed.
      if (session && !this.decodeClaims(session.access_token)?.company_id) {
        await this.claimTeamInvitations();
        const refreshed = await this.client.auth.refreshSession();
        if (refreshed.error) throw refreshed.error;
        session = refreshed.data.session;
      }

      this.session.set(session);
      return session;
    });

    this.sessionLoad = this.withTimeout(load, timeoutMs, 'Session restore timed out')
      .catch(error => {
        this.session.set(null);
        this.sessionRestoreFailed = true;
        throw error;
      })
      .finally(() => {
        this.sessionLoad = null;
      });
    return this.sessionLoad;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      promise.then(
        value => {
          window.clearTimeout(timer);
          resolve(value);
        },
        error => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  /** Decode the access token payload to read custom claims (company_id, user_role). */
  claims(): AppJwtClaims | null {
    const token = this.session()?.access_token;
    return token ? this.decodeClaims(token) : null;
  }

  async claimTeamInvitations(): Promise<TeamInvitationClaimResult> {
    const { data, error } = await this.client.rpc('claim_team_invitations');
    if (error) throw error;
    const result = data as unknown as Partial<TeamInvitationClaimResult> | null;
    return {
      claimed_count: typeof result?.claimed_count === 'number' ? result.claimed_count : 0,
      company_id: typeof result?.company_id === 'string' ? result.company_id : null,
    };
  }

  private decodeClaims(token: string): AppJwtClaims | null {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload)) as AppJwtClaims;
    } catch {
      return null;
    }
  }

  /**
   * Resolve the company selected by the token hook.
   *
   * Platform administrators can read every company through RLS, so an
   * unfiltered `limit(1)` is not a tenant lookup for them. The JWT claim is
   * the source of truth used by current_company_id() and every tenant-scoped
   * query; the shell must render that exact same company.
   */
  async currentCompany(): Promise<Company | null> {
    const companyId = this.claims()?.company_id;
    if (!companyId) return null;
    const { data, error } = await this.client
      .from('companies')
      .select('id, name, code')
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
