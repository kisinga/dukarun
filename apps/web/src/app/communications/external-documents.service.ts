import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type ExternalDocumentType = 'receipt' | 'invoice' | 'proforma' | 'purchase_order';
export type ExternalDocumentChannel = 'sms' | 'whatsapp';

export interface ExternalDocumentPreview {
  document_type: ExternalDocumentType;
  document_number: string;
  party_name: string;
  recipient: string;
  company_copy_recipient: string | null;
  body: string;
  company_copy_body: string | null;
}

export interface ExternalDocumentSendResult {
  queued: boolean;
  outbox_id: string;
  company_copy_outbox_id: string | null;
  company_copy_error: string | null;
  recipient: string;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class ExternalDocumentsService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async preview(
    type: ExternalDocumentType,
    subjectId: string,
    channel: ExternalDocumentChannel,
    includeCompanyCopy = false
  ): Promise<ExternalDocumentPreview> {
    const { data, error } = await this.db.rpc('preview_external_document', {
      p_document_type: type,
      p_subject_id: subjectId,
      p_channel: channel,
      p_include_company_copy: includeCompanyCopy,
    });
    if (error) throw rpcError(error);
    return data as unknown as ExternalDocumentPreview;
  }

  async send(
    type: ExternalDocumentType,
    subjectId: string,
    channel: ExternalDocumentChannel,
    includeCompanyCopy = false,
    bypassQuietHours = false
  ): Promise<ExternalDocumentSendResult> {
    const { data, error } = await this.db.rpc('send_external_document', {
      p_document_type: type,
      p_subject_id: subjectId,
      p_channel: channel,
      p_include_company_copy: includeCompanyCopy,
      p_bypass_quiet_hours: bypassQuietHours,
    });
    if (error) throw rpcError(error);
    return data as unknown as ExternalDocumentSendResult;
  }
}
