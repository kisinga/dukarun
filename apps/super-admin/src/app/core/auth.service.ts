import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';

/**
 * Platform auth: email/password users whose id is in platform_admins.
 * The custom_access_token_hook injects is_platform_admin into the JWT.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  );

  readonly session = signal<Session | null>(null);

  constructor() {
    this.client.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /** Decode the access-token payload to read custom claims. */
  claims(): { is_platform_admin?: boolean } | null {
    const token = this.session()?.access_token;
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch {
      return null;
    }
  }

  isPlatformAdmin(): boolean {
    return this.claims()?.is_platform_admin === true;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
