import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import type { TaxCategory, TaxPackageReadiness, TaxPackageStatus } from '@dukarun/tax-types';
import type { MpesaCommissioningStatus } from '@dukarun/mpesa-types';
import { AuthService } from '../core/auth.service';

export type Company = Database['public']['Tables']['companies']['Row'];
export type Tier = Database['public']['Tables']['subscription_tiers']['Row'];
export type AuditRow = Database['public']['Tables']['audit_log']['Row'];
export type OutboxRow = Database['public']['Tables']['outbox']['Row'];
export type CampaignRow = Database['public']['Tables']['message_campaigns']['Row'];
export type MessageTemplateRow = Database['public']['Tables']['message_templates']['Row'];
export type PlatformCommunicationSettings =
  Database['public']['Tables']['platform_communication_settings']['Row'];
export type FailedOutboxRow = OutboxRow & {
  companies: Pick<Company, 'name' | 'code'> | null;
};

export interface PlatformStats {
  companies_total: number;
  companies_approved: number;
  companies_pending: number;
  subscriptions_active: number;
  subscriptions_expired: number;
  users_total: number;
  monthly_active_users: number;
  orders_today: number;
  revenue_today: number;
  mrr_estimate: number;
  pos_devices_total: number;
  pos_devices_recent_30d: number;
  pos_devices_active_24h: number;
  pos_devices_stale_30d: number;
  pos_devices_dormant_30d: number;
  pos_devices_with_last_reported_pending: number;
  offline_sales_last_reported_pending: number;
  companies_with_active_pos_30d: number;
}
export interface OperationsSnapshot {
  pending_companies: number;
  failed_outbox: number;
  active_memberships: number;
  unbalanced_journals: number;
}
export interface BillingConfig {
  newCustomerTierCode: string;
  newCustomerTierName: string;
  initialPurchasePrice: number;
  testingAccessMonths: number;
}
export interface PlatformSalesperson {
  id: string;
  name: string;
  phone: string | null;
  invitation_code: string;
  active: boolean;
  created_at: string;
  registrations: number;
  approvals: number;
  first_payments: number;
  first_payment_revenue: number;
  pending_commission: number;
  paid_commission: number;
}
export interface PlatformSalesCommission {
  id: string;
  salesperson_id: string;
  salesperson_name: string;
  company_id: string;
  company_name: string;
  payment_reference: string;
  collected_amount: number;
  rate_bps: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  payout_reference: string | null;
  reversal_reason: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  reversed_at: string | null;
}
export interface PlatformSalesSnapshot {
  settings: { enabled: boolean; rate_bps: number };
  totals: {
    registrations: number;
    approvals: number;
    first_payments: number;
    first_payment_revenue: number;
    pending_commission: number;
    paid_commission: number;
  };
  salespeople: PlatformSalesperson[];
  commissions: PlatformSalesCommission[];
  commission_total: number;
}
export interface TrialAccessRequestRow {
  id: string;
  company_id: string;
  company_name: string;
  company_code: string;
  company_status: string;
  subscription_status: string | null;
  subscription_exempt_until: string | null;
  subscription_tier_name: string | null;
  subscription_tier_code: string | null;
  requested_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string | null;
  granted_until: string | null;
  reviewed_at: string | null;
  created_at: string;
}
export interface PlatformCampaignPreview {
  total: number;
  eligible: number;
  skipped: number;
  missing_primary: number;
  missing_phone: number;
  sample: {
    merchant_name: string;
    tier: string;
    subscription_state: string;
    subscription_end_date: string;
  } | null;
}
export interface PlatformCampaignMetrics {
  targeted: number;
  skipped: number;
  queued: number;
  provider_accepted: number;
  failed: number;
  read: number;
  clicked: number;
}
export interface PlatformExternalMetrics {
  provider_accepted: number;
  failed: number;
  pending: number;
  documents_opened: number;
  link_opens: number;
}
export interface CompanyLegalStatus {
  company_id: string;
  company_name: string;
  terms_version: string | null;
  legal_status: 'accepted' | 'grace_period' | 'blocked' | 'not_required';
  accepted_at: string | null;
  accepted_by: string | null;
}
export interface RegistrationConfig {
  automatic_company_approval_enabled: boolean;
  hourly_alert_threshold: number;
  daily_alert_threshold: number;
  automatic_last_hour: number;
  automatic_last_day: number;
  updated_at: string | null;
}
export interface RegistrationAlert {
  id: string;
  alert_window: 'hourly' | 'daily';
  window_started_at: string;
  approval_count: number;
  threshold: number;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}
export interface PlatformBlogPost {
  post_id: string;
  revision_id: string | null;
  version_number: number | null;
  slug: string;
  publication_state: 'draft' | 'scheduled' | 'published' | 'superseded' | 'archived' | 'empty';
  title: string | null;
  excerpt: string | null;
  content_markdown?: string | null;
  author_name: string | null;
  cover_image_path: string | null;
  cover_image_alt: string | null;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  featured_at: string | null;
  has_published_version: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface PlatformBlogMetrics {
  views: number;
  unique_readers: number;
  engaged_readers: number;
  scroll_90: number;
  cta_clicks: number;
  share_clicks: number;
  registrations: number;
  posts: Array<{
    post_id: string;
    slug: string;
    title: string;
    views: number;
    unique_readers: number;
    cta_clicks: number;
    registrations: number;
  }>;
}
export interface SiteDeployment {
  id: string;
  provider_deployment_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  error_summary: string | null;
  created_at: string;
  completed_at: string | null;
}
export interface PlatformTaxJurisdiction {
  id: string;
  country_code: string;
  name: string;
  currency_code: string;
  default_timezone: string;
  active: boolean;
  status: TaxPackageStatus;
  published_at: string | null;
  retired_at: string | null;
  readiness: TaxPackageReadiness;
  categories: TaxCategory[];
}
export interface PlatformMpesaRequest {
  id: string;
  company_id: string;
  company_name: string;
  legal_name: string;
  shortcode: string;
  shortcode_type: 'till' | 'paybill';
  mpesa_username: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  requested_location_ids: string[];
  existing_c2b_integration: boolean;
  existing_c2b_notes: string | null;
  prepared_daraja_app_id: string | null;
  safaricom_authorization_verified_at: string | null;
  safaricom_authorization_reference: string | null;
  status: string;
  merchant_notes: string | null;
  operator_notes: string | null;
  created_at: string;
  commissioning: MpesaCommissioningStatus;
}
export interface PlatformMpesaConnection {
  id: string;
  company_id: string;
  company_name: string;
  display_name: string;
  daraja_app_id: string;
  environment: 'sandbox' | 'production';
  shortcode_type: 'till' | 'paybill';
  organization_shortcode: string;
  business_shortcode: string;
  party_b: string;
  status: string;
  manual_fallback_until: string | null;
  oauth_verified: boolean;
  c2b_registered: boolean;
  stk_test_passed: boolean;
  c2b_test_passed: boolean;
  backlog: number;
  manual_review: number;
  c2b_test_candidates: Array<{ id: string; provider_receipt: string; occurred_at: string | null }>;
  commissioning: MpesaCommissioningStatus;
}
export interface PlatformMpesaOverview {
  settings: {
    enabled: boolean;
    manual_fallback_allowed: boolean;
    pilot_company_id: string | null;
    safaricom_authorization_email: string | null;
    dukarun_mpesa_contact_name: string;
    dukarun_mpesa_contact_email: string;
    dukarun_mpesa_contact_phone: string | null;
    mpesa_callback_base_url: string;
  };
  requests: PlatformMpesaRequest[];
  daraja_apps: Array<{
    id: string;
    company_id: string;
    app_name: string;
    environment: 'sandbox' | 'production';
    status: string;
    oauth_verified: boolean;
  }>;
  connections: PlatformMpesaConnection[];
}
export type LegalDocumentType = 'privacy' | 'terms' | 'dpa' | 'subprocessors';
export interface LegalDocumentVersion {
  id: string;
  document_type: LegalDocumentType;
  version: string;
  content_markdown: string | null;
  content_sha256: string;
  effective_at: string;
  enforcement_at: string | null;
  publication_state: 'draft' | 'published' | 'superseded';
  requires_company_acceptance: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_by: string | null;
}

function rpcError(error: { message: string; code?: string }): Error {
  return new Error(error.message);
}

async function mpesaFunctionError(error: unknown): Promise<Error> {
  let message = error instanceof Error ? error.message : 'M-PESA action failed';
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = (await context
      .clone()
      .json()
      .catch(() => null)) as { message?: string; error?: string } | null;
    message = body?.message ?? body?.error ?? message;
  }

  const friendlyMessages: Record<string, string> = {
    mpesa_callback_url_not_configured:
      'Public callbacks are not configured. Set the platform M-PESA callback base URL before registering C2B or sending a live test.',
    invalid_mpesa_phone: 'Enter a valid Safaricom phone number, for example 0712345678.',
    mpesa_activation_checks_incomplete: 'Complete all four production checks before going live.',
    production_connection_required: 'Only a production connection can go live.',
    mpesa_credentials_missing: 'The Daraja consumer credentials are missing.',
    mpesa_connection_not_found: 'This M-PESA connection no longer exists. Refresh and try again.',
  };
  return new Error(friendlyMessages[message] ?? message.replaceAll('_', ' '));
}

/** Platform operations data (all RPCs raise platform_admin_required otherwise). */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly auth = inject(AuthService);

  private get db() {
    return this.auth.client;
  }

  async stats(): Promise<PlatformStats> {
    const { data, error } = await this.db.rpc('platform_stats');
    if (error) throw rpcError(error);
    return data as unknown as PlatformStats;
  }

  async operationsSnapshot(): Promise<OperationsSnapshot> {
    const { data, error } = await this.db.rpc('platform_operations_snapshot');
    if (error) throw rpcError(error);
    return data as unknown as OperationsSnapshot;
  }

  async registrationConfig(): Promise<RegistrationConfig> {
    const { data, error } = await this.db.rpc('platform_registration_config');
    if (error) throw rpcError(error);
    return data as unknown as RegistrationConfig;
  }

  async updateRegistrationConfig(input: {
    automatic: boolean;
    hourlyThreshold: number;
    dailyThreshold: number;
  }): Promise<RegistrationConfig> {
    const { data, error } = await this.db.rpc('platform_update_registration_config', {
      p_automatic_company_approval_enabled: input.automatic,
      p_hourly_alert_threshold: input.hourlyThreshold,
      p_daily_alert_threshold: input.dailyThreshold,
    });
    if (error) throw rpcError(error);
    return data as unknown as RegistrationConfig;
  }

  async registrationAlerts(): Promise<RegistrationAlert[]> {
    const { data, error } = await this.db.rpc('platform_registration_alerts', { p_limit: 20 });
    if (error) throw rpcError(error);
    return (data ?? []) as unknown as RegistrationAlert[];
  }

  async acknowledgeRegistrationAlert(alertId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_acknowledge_registration_alert', {
      p_alert_id: alertId,
    });
    if (error) throw rpcError(error);
  }

  async blogPosts(): Promise<PlatformBlogPost[]> {
    const { data, error } = await this.db.rpc('platform_blog_posts');
    if (error) throw rpcError(error);
    return (data ?? []) as unknown as PlatformBlogPost[];
  }

  async blogPost(postId: string): Promise<PlatformBlogPost> {
    const { data, error } = await this.db.rpc('platform_blog_post', { p_post_id: postId });
    if (error) throw rpcError(error);
    if (!data) throw new Error('Blog article not found');
    return data as unknown as PlatformBlogPost;
  }

  async blogMetrics(postId?: string): Promise<PlatformBlogMetrics> {
    const { data, error } = await this.db.rpc('platform_blog_metrics', {
      ...(postId ? { p_post_id: postId } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformBlogMetrics;
  }

  async saveBlogDraft(input: {
    postId: string | null;
    slug: string;
    title: string;
    excerpt: string;
    markdown: string;
    authorName: string;
    coverImagePath: string | null;
    coverImageAlt: string | null;
    tags: string[];
    seoTitle: string | null;
    seoDescription: string | null;
  }): Promise<{ post_id: string; revision_id: string }> {
    const { data, error } = await this.db.rpc('platform_save_blog_draft', {
      p_post_id: input.postId!,
      p_slug: input.slug,
      p_title: input.title,
      p_excerpt: input.excerpt,
      p_content_markdown: input.markdown,
      p_author_name: input.authorName,
      p_cover_image_path: input.coverImagePath!,
      p_cover_image_alt: input.coverImageAlt!,
      p_tags: input.tags,
      p_seo_title: input.seoTitle!,
      p_seo_description: input.seoDescription!,
    });
    if (error) throw rpcError(error);
    return data as unknown as { post_id: string; revision_id: string };
  }

  async publishBlogPost(postId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_publish_blog_post', { p_post_id: postId });
    if (error) throw rpcError(error);
  }

  async featureBlogPost(postId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_feature_blog_post', { p_post_id: postId });
    if (error) throw rpcError(error);
  }

  async scheduleBlogPost(postId: string, scheduledFor: string): Promise<void> {
    const { error } = await this.db.rpc('platform_schedule_blog_post', {
      p_post_id: postId,
      p_scheduled_for: scheduledFor,
    });
    if (error) throw rpcError(error);
  }

  async cancelScheduledBlogPost(postId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_cancel_scheduled_blog_post', {
      p_post_id: postId,
    });
    if (error) throw rpcError(error);
  }

  async archiveBlogPost(postId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_archive_blog_post', { p_post_id: postId });
    if (error) throw rpcError(error);
  }

  async deleteBlogPost(postId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_delete_blog_post', { p_post_id: postId });
    if (!error) return;
    if (error.message.includes('blog_post_has_registration_attributions')) {
      throw new Error(
        'This article is linked to registration attribution data. Unpublish it instead.'
      );
    }
    throw rpcError(error);
  }

  async uploadBlogMedia(postId: string, file: File): Promise<string> {
    const safeFile = await this.prepareBlogMedia(file);
    const extension = safeFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${postId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await this.db.storage.from('blog-media').upload(path, safeFile, {
      contentType: safeFile.type,
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async uploadBlogCover(postId: string, file: File): Promise<string> {
    return this.uploadBlogMedia(postId, file);
  }

  blogCoverUrl(path: string | null): string | null {
    return path ? this.db.storage.from('blog-media').getPublicUrl(path).data.publicUrl : null;
  }

  blogMediaUrl(path: string): string {
    return this.db.storage.from('blog-media').getPublicUrl(path).data.publicUrl;
  }

  private async prepareBlogMedia(file: File): Promise<File> {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (file.size > 5 * 1024 * 1024 || !allowedTypes.includes(file.type)) {
      throw new Error('Use a JPEG, PNG, WebP, or safe SVG image up to 5 MB.');
    }
    if (file.type !== 'image/svg+xml') return file;

    const source = await file.text();
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('This SVG contains unsafe XML.');

    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    if (
      root.localName !== 'svg' ||
      root.namespaceURI !== 'http://www.w3.org/2000/svg' ||
      document.querySelector('parsererror')
    ) {
      throw new Error('The selected SVG is not valid.');
    }

    document
      .querySelectorAll(
        'script, foreignObject, iframe, object, embed, image, audio, video, canvas, style, animate, animateMotion, animateTransform, set'
      )
      .forEach(element => element.remove());

    document.querySelectorAll('*').forEach(element => {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        const isLocalReference = value.startsWith('#');
        if (
          name.startsWith('on') ||
          name === 'style' ||
          ((name === 'href' || name === 'xlink:href') && !isLocalReference) ||
          /(?:javascript|vbscript|data):/i.test(value)
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    });

    const sanitized = new XMLSerializer().serializeToString(document);
    return new File([sanitized], file.name, {
      type: 'image/svg+xml',
      lastModified: file.lastModified,
    });
  }

  async siteDeployments(): Promise<SiteDeployment[]> {
    const { data, error } = await this.db.rpc('platform_site_deployments');
    if (error) throw rpcError(error);
    return (data ?? []) as unknown as SiteDeployment[];
  }

  async failedOutbox(): Promise<FailedOutboxRow[]> {
    const { data, error } = await this.db
      .from('outbox')
      .select('*, companies(name, code)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  }

  async platformCampaigns(): Promise<CampaignRow[]> {
    const { data, error } = await this.db
      .from('message_campaigns')
      .select('*')
      .eq('scope', 'platform')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  async platformTemplates(): Promise<MessageTemplateRow[]> {
    const { data, error } = await this.db
      .from('message_templates')
      .select('*')
      .eq('context', 'platform')
      .is('company_id', null)
      .order('name');
    if (error) throw error;
    return data;
  }

  async communicationSettings(): Promise<PlatformCommunicationSettings> {
    const { data, error } = await this.db
      .from('platform_communication_settings')
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async setExternalMessaging(enabled: boolean): Promise<number> {
    const { data, error } = await this.db.rpc('platform_set_external_messaging', {
      p_enabled: enabled,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async setCompanyAutomationOverride(companyId: string, override: boolean | null): Promise<number> {
    const { data, error } = await this.db.rpc(
      'platform_set_company_automation_override',
      override === null
        ? { p_company_id: companyId }
        : { p_company_id: companyId, p_override: override }
    );
    if (error) throw rpcError(error);
    return data;
  }

  async savePlatformTemplate(input: {
    id: string;
    name: string;
    smsBody: string;
    whatsappBody: string;
    inAppTitle: string;
    inAppBody: string;
  }): Promise<void> {
    const { error } = await this.db.rpc('platform_upsert_message_template', {
      p_template_id: input.id,
      p_name: input.name,
      p_sms_body: input.smsBody,
      p_whatsapp_body: input.whatsappBody,
      p_in_app_title: input.inAppTitle,
      p_in_app_body: input.inAppBody,
    });
    if (error) throw rpcError(error);
  }

  async pendingCompanies(): Promise<Company[]> {
    const { data, error } = await this.db
      .from('companies')
      .select('*')
      .eq('status', 'unapproved')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async companies(query = ''): Promise<Company[]> {
    let q = this.db
      .from('companies')
      .select('*, subscription_tiers(name, code)')
      .order('created_at', { ascending: false })
      .limit(100);
    const trimmed = query.trim();
    if (trimmed) {
      const pattern = `%${trimmed.replace(/[%_,()]/g, ' ')}%`;
      q = q.or(`name.ilike.${pattern},code.ilike.${pattern}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async companyLegalStatuses(): Promise<CompanyLegalStatus[]> {
    const { data, error } = await this.db.rpc('platform_company_legal_status');
    if (error) throw rpcError(error);
    return data as unknown as CompanyLegalStatus[];
  }

  async trialAccessRequests(status: string | null = 'pending'): Promise<TrialAccessRequestRow[]> {
    const { data, error } = await this.db.rpc('platform_trial_access_requests', {
      p_status: status!,
      p_limit: 100,
    });
    if (error) throw rpcError(error);
    return data as unknown as TrialAccessRequestRow[];
  }

  async reviewTrialAccessRequest(input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    tierId?: string;
    grantedUntil?: string;
    note?: string;
  }): Promise<void> {
    const { error } = await this.db.rpc('platform_review_trial_access_request', {
      p_request_id: input.requestId,
      p_decision: input.decision,
      ...(input.tierId ? { p_tier_id: input.tierId } : {}),
      ...(input.grantedUntil ? { p_granted_until: input.grantedUntil } : {}),
      ...(input.note ? { p_decision_note: input.note } : {}),
    });
    if (error) throw rpcError(error);
  }

  async legalDocuments(): Promise<LegalDocumentVersion[]> {
    const { data, error } = await this.db.rpc('platform_legal_documents');
    if (error) throw error;
    return data as unknown as LegalDocumentVersion[];
  }

  async saveLegalDraft(input: {
    id: string | null;
    type: LegalDocumentType;
    version: string;
    markdown: string;
    effectiveAt: string;
    enforcementAt: string | null;
    requiresAcceptance: boolean;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_save_legal_draft', {
      p_id: input.id!,
      p_document_type: input.type,
      p_version: input.version,
      p_content_markdown: input.markdown,
      p_effective_at: input.effectiveAt,
      p_enforcement_at: input.enforcementAt!,
      p_requires_company_acceptance: input.requiresAcceptance,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async publishLegalDocument(id: string, expectedHash: string): Promise<void> {
    const { error } = await this.db.rpc('platform_publish_legal_document', {
      p_id: id,
      p_expected_sha256: expectedHash,
    });
    if (error) throw rpcError(error);
  }

  async discardLegalDraft(id: string): Promise<void> {
    const { error } = await this.db.rpc('platform_discard_legal_draft', { p_id: id });
    if (error) throw rpcError(error);
  }

  async companyCounts(companyId: string): Promise<{ members: number; orders: number }> {
    const [members, orders] = await Promise.all([
      this.db
        .from('company_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
      this.db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
    ]);
    if (members.error) throw members.error;
    if (orders.error) throw orders.error;
    return { members: members.count ?? 0, orders: orders.count ?? 0 };
  }

  async setCompanyStatus(companyId: string, status: string): Promise<void> {
    const { error } = await this.db.rpc('platform_set_company_status', {
      p_company_id: companyId,
      p_status: status,
    });
    if (error) throw rpcError(error);
  }

  async updateSubscription(
    companyId: string,
    changes: {
      tier_id?: string;
      subscription_status?: string;
      exempt_until?: string;
      exempt_reason?: string;
      expires_at?: string;
    }
  ): Promise<void> {
    const { error } = await this.db.rpc('platform_update_subscription', {
      p_company_id: companyId,
      ...(changes.tier_id ? { p_tier_id: changes.tier_id } : {}),
      ...(changes.subscription_status
        ? { p_subscription_status: changes.subscription_status }
        : {}),
      ...(changes.exempt_until ? { p_exempt_until: changes.exempt_until } : {}),
      ...(changes.exempt_reason ? { p_exempt_reason: changes.exempt_reason } : {}),
      ...(changes.expires_at ? { p_expires_at: changes.expires_at } : {}),
    });
    if (error) throw rpcError(error);
  }

  async tiers(): Promise<Tier[]> {
    const { data, error } = await this.db
      .from('subscription_tiers')
      .select('*')
      .order('price_monthly');
    if (error) throw error;
    return data;
  }

  async billingConfig(): Promise<BillingConfig | null> {
    const { data, error } = await this.db.rpc('public_billing_config');
    if (error) throw rpcError(error);
    return data as unknown as BillingConfig | null;
  }

  async updateBillingPolicy(input: {
    newCustomerTierId: string;
    testingAccessMonths: number;
  }): Promise<void> {
    const { error } = await this.db.rpc('platform_update_paid_onboarding_policy', {
      p_new_customer_tier_id: input.newCustomerTierId,
      p_testing_access_months: input.testingAccessMonths,
    });
    if (error) throw rpcError(error);
  }

  async salesSnapshot(offset = 0, limit = 100): Promise<PlatformSalesSnapshot> {
    const { data, error } = await this.db.rpc('platform_sales_snapshot', {
      p_commission_limit: limit,
      p_commission_offset: offset,
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformSalesSnapshot;
  }

  async createSalesperson(name: string, phone: string, invitationCode: string): Promise<string> {
    const { data, error } = await this.db.rpc('platform_create_salesperson', {
      p_name: name,
      p_phone: phone,
      p_invitation_code: invitationCode,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async sendSalesInvitation(
    salespersonId: string,
    qrCodeBase64: string
  ): Promise<{ deliveryUncertain: boolean }> {
    const { data, error } = await this.db.functions.invoke('platform-sales-invitation-send', {
      body: { salesperson_id: salespersonId, qr_code_base64: qrCodeBase64 },
    });
    if (!error) {
      return {
        deliveryUncertain: Boolean(
          (data as { delivery_uncertain?: boolean } | null)?.delivery_uncertain
        ),
      };
    }

    const context = (error as { context?: unknown }).context;
    const payload =
      context instanceof Response
        ? await context
            .clone()
            .json()
            .catch(() => null)
        : null;
    const code = (payload as { error?: string } | null)?.error;
    const messages: Record<string, string> = {
      salesperson_inactive: 'Activate this salesperson before sending their invitation.',
      salesperson_phone_required: 'Add a phone number before sending through WhatsApp.',
      salesperson_phone_invalid: 'Enter a valid international phone number before sending.',
      platform_admin_required: 'Your platform-admin session is stale. Sign in again and retry.',
      invitation_send_too_soon: 'This invitation was just sent. Wait 30 seconds before resending.',
      invitation_claim_failed: 'Invitation sending is temporarily unavailable.',
      invalid_qr_code: 'The invitation QR code is invalid. Close this dialog and try again.',
      'provider_not_configured: openwa': 'The WhatsApp gateway is not configured.',
    };
    throw new Error(
      (code && messages[code]) ||
        (code?.startsWith('openwa ')
          ? 'WhatsApp rejected the invitation. Check the phone number and try again.'
          : error.message)
    );
  }

  async setSalespersonActive(salespersonId: string, active: boolean): Promise<void> {
    const { error } = await this.db.rpc('platform_set_salesperson_active', {
      p_salesperson_id: salespersonId,
      p_active: active,
    });
    if (error) throw rpcError(error);
  }

  async updateSalesCommissionSettings(enabled: boolean, rateBps: number): Promise<void> {
    const { error } = await this.db.rpc('platform_update_sales_commission_settings', {
      p_enabled: enabled,
      p_rate_bps: rateBps,
    });
    if (error) throw rpcError(error);
  }

  async reviewSalesCommission(
    commissionId: string,
    status: 'approved' | 'paid' | 'reversed',
    payoutReference?: string,
    reason?: string
  ): Promise<void> {
    const { error } = await this.db.rpc('platform_review_sales_commission', {
      p_commission_id: commissionId,
      p_status: status,
      p_payout_reference: payoutReference,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
  }

  async upsertTier(input: {
    code: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    multiple_locations_enabled: boolean;
    staff_performance_enabled: boolean;
    commissions_available: boolean;
    max_team_members: number | null;
    max_products: number | null;
    max_stock_locations: number | null;
    max_orders_per_month: number | null;
    sms_per_period: number | null;
    whatsapp_per_period: number | null;
    storefront_available: boolean;
    customer_campaigns_available: boolean;
    payment_reminders_available: boolean;
    tier_id?: string;
    is_active?: boolean;
  }): Promise<string> {
    if ((input.max_products ?? 10_000) > 10_000) {
      throw new Error('Product limits above 10,000 require Enterprise');
    }
    const { data, error } = await this.db.rpc('platform_save_tier', {
      p_code: input.code,
      p_name: input.name,
      p_price_monthly: input.price_monthly,
      p_price_yearly: input.price_yearly,
      p_multiple_locations_enabled: input.multiple_locations_enabled,
      p_staff_performance_enabled: input.staff_performance_enabled,
      p_commissions_available: input.commissions_available,
      p_storefront_available: input.storefront_available,
      p_customer_campaigns_available: input.customer_campaigns_available,
      p_payment_reminders_available: input.payment_reminders_available,
      p_max_team_members: input.max_team_members ?? undefined,
      p_max_products: input.max_products ?? 10_000,
      p_max_stock_locations: input.max_stock_locations ?? undefined,
      p_max_orders_per_month: input.max_orders_per_month ?? undefined,
      p_sms_per_period: input.sms_per_period ?? undefined,
      p_whatsapp_per_period: input.whatsapp_per_period ?? undefined,
      ...(input.tier_id ? { p_tier_id: input.tier_id } : {}),
      ...(input.is_active !== undefined ? { p_is_active: input.is_active } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async previewCampaign(input: {
    channel: 'in_app' | 'sms' | 'whatsapp';
    audience: 'all' | 'tier' | 'subscription_status' | 'selected';
    tierId?: string;
    subscriptionStatus?: string;
    companyIds?: string[];
  }): Promise<PlatformCampaignPreview> {
    const { data, error } = await this.db.rpc('platform_campaign_preview', {
      p_channel: input.channel,
      p_audience: input.audience,
      ...(input.tierId ? { p_tier_id: input.tierId } : {}),
      ...(input.subscriptionStatus ? { p_subscription_status: input.subscriptionStatus } : {}),
      ...(input.companyIds?.length ? { p_company_ids: input.companyIds } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformCampaignPreview;
  }

  async reviewCampaign(id: string): Promise<PlatformCampaignPreview> {
    const { data, error } = await this.db.rpc('platform_review_campaign', {
      p_campaign_id: id,
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformCampaignPreview;
  }

  async saveCampaignDraft(input: {
    id?: string;
    name: string;
    title: string;
    body: string;
    channel: 'in_app' | 'sms' | 'whatsapp';
    audience: 'all' | 'tier' | 'subscription_status' | 'selected';
    tierId?: string;
    subscriptionStatus?: string;
    companyIds?: string[];
    ctaLabel?: string;
    ctaLink?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_save_campaign_draft', {
      p_name: input.name,
      p_title: input.title,
      p_body: input.body,
      p_channel: input.channel,
      p_audience: input.audience,
      p_tier_id: input.tierId,
      p_subscription_status: input.subscriptionStatus,
      p_company_ids: input.companyIds,
      p_cta_label: input.ctaLabel,
      p_cta_link: input.ctaLink,
      p_campaign_id: input.id,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async launchCampaign(id: string, scheduledFor?: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.db.rpc('platform_launch_campaign', {
      p_campaign_id: id,
      p_scheduled_for: scheduledFor,
    });
    if (error) throw rpcError(error);
    return data as Record<string, unknown>;
  }

  async cancelCampaign(id: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('platform_cancel_campaign', { p_campaign_id: id });
    if (error) throw rpcError(error);
    return data;
  }

  async duplicateCampaign(id: string): Promise<string> {
    const { data, error } = await this.db.rpc('platform_duplicate_campaign', {
      p_campaign_id: id,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async campaignMetrics(id: string): Promise<PlatformCampaignMetrics> {
    const { data, error } = await this.db.rpc('platform_campaign_metrics', {
      p_campaign_id: id,
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformCampaignMetrics;
  }

  async externalCommunicationMetrics(): Promise<PlatformExternalMetrics> {
    const { data, error } = await this.db.rpc('platform_external_communication_metrics');
    if (error) throw rpcError(error);
    return data as unknown as PlatformExternalMetrics;
  }

  async taxCatalog(): Promise<PlatformTaxJurisdiction[]> {
    const { data, error } = await this.db.rpc('platform_tax_catalog');
    if (error) throw rpcError(error);
    return data as unknown as PlatformTaxJurisdiction[];
  }

  async mpesaOverview(): Promise<PlatformMpesaOverview> {
    const { data, error } = await this.db.rpc('platform_mpesa_overview');
    if (error) throw rpcError(error);
    return data as unknown as PlatformMpesaOverview;
  }

  async mpesaAction(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await this.db.functions.invoke('mpesa-credentials', { body: input });
    if (error) throw await mpesaFunctionError(error);
    return data as Record<string, unknown>;
  }

  async prepareMpesaDarajaApp(input: {
    requestId: string;
    appName: string;
    environment: 'sandbox' | 'production';
    consumerKey: string;
    consumerSecret: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_prepare_mpesa_daraja_app', {
      p_request_id: input.requestId,
      p_app_name: input.appName,
      p_environment: input.environment,
      p_consumer_key: input.consumerKey,
      p_consumer_secret: input.consumerSecret,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async upsertTaxJurisdiction(input: {
    countryCode: string;
    name: string;
    currencyCode: string;
    timezone: string;
    active?: boolean;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_upsert_tax_jurisdiction', {
      p_country_code: input.countryCode,
      p_name: input.name,
      p_currency_code: input.currencyCode,
      p_default_timezone: input.timezone,
      p_active: input.active ?? false,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async publishTaxPackage(jurisdictionId: string): Promise<TaxPackageReadiness> {
    const { data, error } = await this.db.rpc('platform_publish_tax_package', {
      p_jurisdiction_id: jurisdictionId,
    });
    if (error) throw rpcError(error);
    return data as unknown as TaxPackageReadiness;
  }

  async taxPackageReadiness(jurisdictionId: string): Promise<TaxPackageReadiness> {
    const { data, error } = await this.db.rpc('platform_tax_package_readiness', {
      p_jurisdiction_id: jurisdictionId,
    });
    if (error) throw rpcError(error);
    return data as unknown as TaxPackageReadiness;
  }

  async retireTaxPackage(jurisdictionId: string): Promise<string> {
    const { data, error } = await this.db.rpc('platform_retire_tax_jurisdiction', {
      p_jurisdiction_id: jurisdictionId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async advanceMpesaRequest(requestId: string, action: string, notes?: string): Promise<void> {
    const { error } = await this.db.rpc('platform_advance_mpesa_request', {
      p_request_id: requestId,
      p_action: action,
      ...(notes ? { p_notes: notes } : {}),
    });
    if (error) throw rpcError(error);
  }

  async upsertTaxCategory(input: {
    jurisdictionId: string;
    code: string;
    name: string;
    classification: 'standard' | 'special' | 'zero_rated' | 'exempt';
    isDefault: boolean;
    active?: boolean;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_upsert_tax_category', {
      p_jurisdiction_id: input.jurisdictionId,
      p_code: input.code,
      p_name: input.name,
      p_classification: input.classification,
      p_is_default: input.isDefault,
      p_active: input.active ?? true,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async publishTaxRate(input: {
    categoryId: string;
    rateBps: number;
    effectiveFrom: string;
    effectiveTo?: string;
    notes?: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('platform_publish_tax_rate_version', {
      p_tax_category_id: input.categoryId,
      p_rate_bps: input.rateBps,
      p_effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { p_effective_to: input.effectiveTo } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async publishTaxCategory(categoryId: string, effectiveFrom: string): Promise<string> {
    const { data, error } = await this.db.rpc('platform_publish_tax_category', {
      p_tax_category_id: categoryId,
      p_effective_from: effectiveFrom,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async testExternalMessage(input: {
    channel: 'sms' | 'whatsapp';
    recipient: string;
    body: string;
  }): Promise<void> {
    const { error } = await this.db.functions.invoke('platform-message-test', { body: input });
    if (error) throw error;
  }

  async auditLog(filters: {
    table?: string;
    operation?: string;
    companyId?: string;
    since?: string;
  }): Promise<AuditRow[]> {
    let q = this.db
      .from('audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100);
    if (filters.table) q = q.eq('table_name', filters.table);
    if (filters.operation) q = q.eq('operation', filters.operation);
    if (filters.companyId) q = q.eq('company_id', filters.companyId);
    if (filters.since) q = q.gte('changed_at', filters.since);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
}
