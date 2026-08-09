import {
  Injectable,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { environment } from '../../environments/environment';
import { FIXTURE_LEGAL_DOCUMENTS } from '../core/public-content.fixture';
import { PublicSupabaseService } from '../core/public-supabase.service';

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

const documentKey = (type: LegalDocumentType) =>
  makeStateKey<PublishedLegalDocument | null>(`site:legal:${type}`);
const historyKey = (type: LegalDocumentType) =>
  makeStateKey<LegalDocumentHistoryItem[]>(`site:legal-history:${type}`);

@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly supabase = inject(PublicSupabaseService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly platformId = inject(PLATFORM_ID);

  transferredDocument(type: LegalDocumentType): PublishedLegalDocument | null | undefined {
    const key = documentKey(type);
    return this.transferState.hasKey(key) ? this.transferState.get(key, null) : undefined;
  }

  transferredHistory(type: LegalDocumentType): LegalDocumentHistoryItem[] | null {
    const key = historyKey(type);
    return this.transferState.hasKey(key) ? this.transferState.get(key, []) : null;
  }

  async publishedDocument(
    type: LegalDocumentType,
    version?: string | null,
    force = false
  ): Promise<PublishedLegalDocument | null> {
    const key = documentKey(type);
    if (!force && !version && this.transferState.hasKey(key))
      return this.transferState.get(key, null);
    const document =
      environment.publicDataMode === 'fixture'
        ? FIXTURE_LEGAL_DOCUMENTS[type]
        : await this.track(async () => {
            const request = version
              ? this.supabase.client.rpc('published_legal_document_version', {
                  p_document_type: type,
                  p_version: version,
                })
              : this.supabase.client.rpc('published_legal_document', { p_document_type: type });
            const { data, error } = await request;
            if (error) throw error;
            return data as unknown as PublishedLegalDocument | null;
          });
    if (!version && isPlatformServer(this.platformId)) this.transferState.set(key, document);
    return document;
  }

  async documentHistory(
    type: LegalDocumentType,
    force = false
  ): Promise<LegalDocumentHistoryItem[]> {
    const key = historyKey(type);
    if (!force && this.transferState.hasKey(key)) return this.transferState.get(key, []);
    if (environment.publicDataMode === 'fixture') {
      const current = FIXTURE_LEGAL_DOCUMENTS[type];
      const history: LegalDocumentHistoryItem[] = [
        {
          version: current.version,
          effective_at: current.effective_at,
          publication_state: 'published',
        },
      ];
      if (isPlatformServer(this.platformId)) this.transferState.set(key, history);
      return history;
    }
    const history = await this.track(async () => {
      const { data, error } = await this.supabase.client.rpc('published_legal_document_history', {
        p_document_type: type,
      });
      if (error) throw error;
      return (data ?? []) as unknown as LegalDocumentHistoryItem[];
    });
    if (isPlatformServer(this.platformId)) this.transferState.set(key, history);
    return history;
  }

  private track<T>(task: () => Promise<T>): Promise<T> {
    const done = this.pendingTasks.add();
    return task().finally(done);
  }
}
