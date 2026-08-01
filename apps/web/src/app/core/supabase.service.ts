import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';

/** Custom claims injected into the JWT by the custom_access_token_hook. */
export interface AppJwtClaims {
  company_id?: string;
  user_role?: string;
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

  constructor() {
    this.client.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /** Decode the access token payload to read custom claims (company_id, user_role). */
  claims(): AppJwtClaims | null {
    const token = this.session()?.access_token;
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload)) as AppJwtClaims;
    } catch {
      return null;
    }
  }

  /** RLS-scoped company lookup: returns the user's company, or null when not provisioned. */
  async currentCompany(): Promise<Company | null> {
    const { data, error } = await this.client.from('companies').select('id, name, code').limit(1);
    if (error) throw error;
    return data[0] ?? null;
  }
}
