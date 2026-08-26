import type { LegalDocumentType, PublishedLegalDocument } from '../legal/legal.service';
import type {
  PublicBillingConfig,
  PublicSubscriptionPlan,
} from '../marketing/public-pricing.service';
import type { PublishedBlogPost } from '../blog/blog.service';

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
    fulfillment_available: true,
    payment_reminders_available: true,
    multiple_locations_enabled: true,
    staff_performance_enabled: true,
    commissions_available: true,
  },
];

export const FIXTURE_BILLING_CONFIG: PublicBillingConfig = {
  newCustomerTierCode: 'standard',
  newCustomerTierName: 'Standard',
  initialPurchasePrice: 1500,
  testingAccessMonths: 2,
};

export const FIXTURE_BLOG_POSTS: PublishedBlogPost[] = [
  {
    post_id: '00000000-0000-4000-8000-000000000075',
    revision_id: '00000000-0000-4000-8000-000000000076',
    slug: 'keep-stock-and-cash-in-step',
    title: 'Keep stock and cash in step',
    excerpt: 'A practical guide to connecting what leaves the shelf with what lands in the till.',
    content_markdown:
      '# Keep stock and cash in step\n\n## Count what matters\n\nA reliable stock count makes every purchasing and cash decision easier.\n\n## Close the loop\n\nRecord each sale when it happens, review exceptions, and close the day against the money received.',
    author_name: 'Dukarun team',
    cover_image_path: null,
    cover_image_alt: null,
    tags: ['stock', 'cash-flow'],
    seo_title: 'Keep stock and cash in step',
    seo_description:
      'Connect stock movement with daily cash control using a simple operating rhythm.',
    published_at: '2026-08-01T06:00:00.000Z',
    updated_at: '2026-08-01T06:00:00.000Z',
    reading_minutes: 3,
  },
];
