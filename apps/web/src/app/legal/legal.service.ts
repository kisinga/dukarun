import { Injectable, effect, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from '../core/cache-journal.service';
import { SupabaseService } from '../core/supabase.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { offlineScopeKey } from '../pos/offline/offline-db';

export type LegalDocumentType = 'privacy' | 'terms' | 'dpa' | 'subprocessors';
export interface PublishedLegalDocument {
  id: string;
  document_type: LegalDocumentType;
  version: string;
  content_markdown: string;
  content_sha256: string;
  effective_at: string;
  enforcement_at: string | null;
  publication_state: 'published' | 'superseded';
  requires_company_acceptance: boolean;
  published_at: string;
}
export interface LegalDocumentHistoryItem {
  version: string;
  effective_at: string;
  publication_state: 'published' | 'superseded';
}
export interface CompanyLegalStatus {
  required: boolean;
  accepted: boolean;
  can_accept: boolean;
  company_status?: 'unapproved' | 'approved' | null;
  document_type?: 'terms';
  required_version?: string;
  version?: string;
  content_sha256?: string;
  effective_at?: string;
  enforcement_at?: string | null;
  enforcement_started?: boolean;
  accepted_at?: string | null;
  offlineConfirmed?: boolean;
}

interface CachedCompanyLegalStatus {
  status: CompanyLegalStatus;
  verifiedAt: number;
}

interface LegalContext {
  scope: string;
  companyId?: string;
  userId?: string;
}

const OFFLINE_STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly supabase = inject(SupabaseService);
  private readonly journal = inject(CacheJournalService);
  private readonly connectivity = inject(ConnectivityService);
  readonly status = signal<CompanyLegalStatus | null>(null);

  private readonly statuses = new Map<string, CompanyLegalStatus>();
  private readonly requests = new Map<string, Promise<CompanyLegalStatus>>();
  private watchedScope: string | null = null;
  private settingsChannel: RealtimeChannel | null = null;
  private enforcementTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResumeTick = 0;

  private readonly settingsHandler: CacheStreamHandler = {
    apply: changes => this.applySettingsChanges(changes),
    reset: async () => {
      await this.refresh(true);
      return true;
    },
  };

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const scope = identity ? offlineScopeKey(identity) : null;
      if (scope !== this.watchedScope) void this.watch(scope, identity?.companyId ?? null);
    });
    effect(() => {
      const tick = this.connectivity.resumeTick();
      const identity = this.supabase.offlineIdentity();
      if (tick > this.lastResumeTick && identity) void this.refresh(true).catch(() => undefined);
      this.lastResumeTick = tick;
    });
  }

  async publishedDocument(
    type: LegalDocumentType,
    version?: string | null
  ): Promise<PublishedLegalDocument | null> {
    const request = version
      ? this.supabase.client.rpc('published_legal_document_version', {
          p_document_type: type,
          p_version: version,
        })
      : this.supabase.client.rpc('published_legal_document', { p_document_type: type });
    const { data, error } = await request;
    if (error) throw error;
    return data as unknown as PublishedLegalDocument | null;
  }

  async documentHistory(type: LegalDocumentType): Promise<LegalDocumentHistoryItem[]> {
    const { data, error } = await this.supabase.client.rpc('published_legal_document_history', {
      p_document_type: type,
    });
    if (error) throw error;
    return (data ?? []) as unknown as LegalDocumentHistoryItem[];
  }

  /** Return this company's verified shell-entry status without another RPC. */
  ensureVerified(): Promise<CompanyLegalStatus> {
    const context = this.currentContext();
    const cached = this.statuses.get(context.scope);
    if (cached) {
      this.commit(context, cached);
      return Promise.resolve(cached);
    }
    return this.refresh();
  }

  /** Force verification, deduplicating concurrent callers for the same identity scope. */
  refresh(afterCurrent = false): Promise<CompanyLegalStatus> {
    const context = this.currentContext();
    const active = this.requests.get(context.scope);
    if (active) {
      if (!afterCurrent) return active;
      return active.then(
        status => (this.currentContext().scope === context.scope ? this.refresh() : status),
        error =>
          this.currentContext().scope === context.scope ? this.refresh() : Promise.reject(error)
      );
    }

    const request = this.fetchStatus(context).finally(() => {
      if (this.requests.get(context.scope) === request) this.requests.delete(context.scope);
    });
    this.requests.set(context.scope, request);
    return request;
  }

  private async fetchStatus(context: LegalContext): Promise<CompanyLegalStatus> {
    try {
      const { data, error } = await this.supabase.client.rpc('current_company_legal_status');
      if (error) throw error;
      const status = data as unknown as CompanyLegalStatus;
      this.commit(context, status);
      if (context.companyId && context.userId) {
        const cached: CachedCompanyLegalStatus = { status, verifiedAt: Date.now() };
        try {
          localStorage.setItem(
            this.cacheKey(context.companyId, context.userId),
            JSON.stringify(cached)
          );
        } catch {
          // A full or restricted cache must not turn a verified status into a failure.
        }
      }
      return status;
    } catch (error) {
      if (context.companyId && context.userId && !navigator.onLine) {
        const cached = this.cachedStatus(context.companyId, context.userId);
        if (cached) {
          const offlineStatus = { ...cached, can_accept: false, offlineConfirmed: true };
          this.commit(context, offlineStatus);
          return offlineStatus;
        }
      }
      throw error;
    }
  }

  async acceptCurrentTerms(status: CompanyLegalStatus): Promise<void> {
    if (!status.version || !status.content_sha256)
      throw new Error('Current Terms could not be verified.');
    const { error } = await this.supabase.client.rpc('accept_company_terms', {
      p_version: status.version,
      p_content_sha256: status.content_sha256,
      p_source: 'account',
    });
    if (error) throw error;
    await this.refresh(true);
  }

  private commit(context: LegalContext, status: CompanyLegalStatus): void {
    this.statuses.set(context.scope, status);
    if (this.currentContext().scope !== context.scope) return;
    this.status.set(status);
    this.scheduleEnforcement(context, status);
  }

  private scheduleEnforcement(context: LegalContext, status: CompanyLegalStatus): void {
    if (this.enforcementTimer) clearTimeout(this.enforcementTimer);
    this.enforcementTimer = null;
    if (!context.companyId || status.accepted || !status.required || !status.enforcement_at) return;
    const remaining = new Date(status.enforcement_at).getTime() - Date.now();
    if (remaining <= 0) {
      if (!status.enforcement_started) void this.refresh(true).catch(() => undefined);
      return;
    }
    // Browsers cap timers near 24.8 days. Re-arm until the legal event's
    // enforcement instant, then verify through the boundary-safe legal RPC.
    const delay = Math.min(remaining + 250, 2_147_000_000);
    this.enforcementTimer = setTimeout(() => {
      if (this.currentContext().scope === context.scope) {
        void this.refresh(true).catch(() => undefined);
      }
    }, delay);
  }

  private applySettingsChanges(changes: readonly CacheChange[]): Promise<void> {
    return changes.some(change =>
      ['legal_document', 'legal_acceptance'].includes(change.entityType)
    )
      ? this.refresh(true).then(() => undefined)
      : Promise.resolve();
  }

  private async watch(scope: string | null, companyId: string | null): Promise<void> {
    const previousScope = this.watchedScope;
    const previousChannel = this.settingsChannel;
    if (previousScope) {
      this.journal.unsubscribe('settings', previousScope, this.settingsHandler, 'legal-status');
    }
    this.settingsChannel = null;
    this.watchedScope = scope;
    const cached = scope ? this.statuses.get(scope) : null;
    if (scope && companyId && cached) {
      this.commit(this.currentContext(), cached);
    } else {
      if (this.enforcementTimer) clearTimeout(this.enforcementTimer);
      this.enforcementTimer = null;
      this.status.set(null);
    }
    if (previousChannel) await this.supabase.client.removeChannel(previousChannel);
    if (!scope || !companyId || this.watchedScope !== scope) return;
    this.settingsChannel = this.journal.subscribe(
      'settings',
      scope,
      companyId,
      this.settingsHandler,
      'legal-status'
    );
  }

  private currentContext(): LegalContext {
    const session = this.supabase.session();
    const companyId = this.supabase.claims()?.company_id;
    if (!session) return { scope: 'anonymous' };
    const userId = session.user.id;
    return {
      scope: companyId ? offlineScopeKey({ companyId, userId }) : `user:${userId}`,
      companyId,
      userId,
    };
  }

  private cacheKey(companyId: string, userId: string): string {
    return `dukarun:legal:status:${companyId}:${userId}`;
  }

  private cachedStatus(companyId: string, userId: string): CompanyLegalStatus | null {
    try {
      const cached = JSON.parse(
        localStorage.getItem(this.cacheKey(companyId, userId)) ?? 'null'
      ) as CachedCompanyLegalStatus | null;
      if (!cached || Date.now() - cached.verifiedAt > OFFLINE_STATUS_MAX_AGE_MS) return null;
      const status = cached.status;
      return {
        ...status,
        enforcement_started: status.enforcement_at
          ? Date.now() >= new Date(status.enforcement_at).getTime()
          : status.enforcement_started,
      };
    } catch {
      return null;
    }
  }
}
