import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';

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

const OFFLINE_STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly supabase = inject(SupabaseService);
  readonly status = signal<CompanyLegalStatus | null>(null);

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

  async refresh(): Promise<CompanyLegalStatus> {
    const companyId = this.supabase.claims()?.company_id;
    try {
      const { data, error } = await this.supabase.client.rpc('current_company_legal_status');
      if (error) throw error;
      const status = data as unknown as CompanyLegalStatus;
      this.status.set(status);
      if (companyId) {
        const cached: CachedCompanyLegalStatus = { status, verifiedAt: Date.now() };
        try {
          localStorage.setItem(this.cacheKey(companyId), JSON.stringify(cached));
        } catch {
          // A full or restricted cache must not turn a verified status into a failure.
        }
      }
      return status;
    } catch (error) {
      if (companyId && !navigator.onLine) {
        const cached = this.cachedStatus(companyId);
        if (cached) {
          const offlineStatus = { ...cached, can_accept: false, offlineConfirmed: true };
          this.status.set(offlineStatus);
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
    await this.refresh();
  }

  private cacheKey(companyId: string): string {
    return `dukarun:legal:status:${companyId}`;
  }

  private cachedStatus(companyId: string): CompanyLegalStatus | null {
    try {
      const cached = JSON.parse(
        localStorage.getItem(this.cacheKey(companyId)) ?? 'null'
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
