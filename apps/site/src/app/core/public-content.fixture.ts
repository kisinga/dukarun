import type { LegalDocumentType, PublishedLegalDocument } from '../legal/legal.service';
import type {
  PublicBillingConfig,
  PublicSubscriptionPlan,
} from '../marketing/public-pricing.service';

const document = (type: LegalDocumentType, title: string): PublishedLegalDocument => ({
  id: `fixture-${type}`,
  document_type: type,
  version: '2026-01-01',
  content_markdown: `# ${title}\n\n## About this document\n\nThis build fixture verifies that published legal content is rendered into static HTML.`,
  content_sha256: '0'.repeat(64),
  effective_at: '2026-01-01T00:00:00.000Z',
  enforcement_at: null,
  publication_state: 'published',
  requires_company_acceptance: type === 'terms',
  published_at: '2026-01-01T00:00:00.000Z',
});

export const FIXTURE_LEGAL_DOCUMENTS: Record<LegalDocumentType, PublishedLegalDocument> = {
  privacy: document('privacy', 'Privacy Notice'),
  terms: document('terms', 'Terms of Service'),
  dpa: document('dpa', 'Data Processing Addendum'),
  subprocessors: document('subprocessors', 'Subprocessors'),
};

export const FIXTURE_PLANS: PublicSubscriptionPlan[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    code: 'standard',
    name: 'Standard',
    price_monthly: 1500,
    price_yearly: 15000,
    max_team_members: 5,
    max_products: 5000,
    max_stock_locations: 3,
    max_orders_per_month: 10000,
    sms_per_period: 500,
    whatsapp_per_period: null,
    storefront_available: true,
    payment_reminders_available: true,
    multiple_locations_enabled: true,
    staff_performance_enabled: true,
    commissions_available: true,
  },
];

export const FIXTURE_BILLING_CONFIG: PublicBillingConfig = {
  trialDays: 14,
  defaultTrialTierCode: 'standard',
};
