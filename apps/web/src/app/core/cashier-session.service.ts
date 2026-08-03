import { Injectable, computed, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from './supabase.service';

type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];

/** One source of truth for the company till across the authenticated app. */
@Injectable({ providedIn: 'root' })
export class CashierSessionService {
  readonly session = signal<CashierSession | null>(null);
  readonly loading = signal(false);
  readonly isOpen = computed(() => this.session() !== null);

  private started = false;
  private refreshPromise: Promise<void> | null = null;
  private channel: RealtimeChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async start(): Promise<void> {
    if (this.started) {
      try {
        await this.refresh();
      } catch {
        // Polling/realtime will retry; keep the last confirmed state.
      }
      return;
    }
    this.started = true;
    try {
      await this.refresh();
    } catch {
      // A transient startup failure must not prevent later refreshes.
    }

    try {
      const company = await this.supabase.currentCompany();
      if (company) {
        this.channel = this.supabase.client
          .channel(`cashier-session:${company.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'cashier_sessions',
              filter: `company_id=eq.${company.id}`,
            },
            () => void this.refresh()
          )
          .subscribe();
      }
    } catch {
      // Polling below remains the fallback if subscription setup fails.
    }

    // Realtime is the fast path; polling covers suspended tabs and reconnects.
    this.pollTimer = setInterval(() => void this.refresh(), 30_000);
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.loading.set(true);
    this.refreshPromise = this.load().finally(() => {
      this.loading.set(false);
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  /** Re-check immediately before a governed action, then fail with useful copy. */
  async assertOpen(action: string): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // If offline, retain the last confirmed state. The database re-checks on sync.
    }
    if (!this.isOpen()) throw new Error(`Open a cashier session before ${action}.`);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('cashier_sessions')
      .select('*')
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw error;
    this.session.set(data);
  }
}
