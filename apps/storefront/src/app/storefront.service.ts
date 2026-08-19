import {
  Injectable,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../environments/environment';

export type StorefrontInfo = Database['public']['Views']['public_storefronts']['Row'];
export type CatalogRow =
  Database['public']['Functions']['storefront_catalog_page']['Returns'][number];
export type ShopCategory =
  Database['public']['Functions']['storefront_categories']['Returns'][number];
export interface CatalogPage {
  rows: CatalogRow[];
  total: number;
  offset: number;
}
export interface CustomerStatement {
  store_name: string;
  logo_path: string | null;
  whatsapp_number: string | null;
  payment_instructions: string | null;
  customer_first_name: string;
  outstanding_total: number;
  amount_due: number;
  downpayment_available: number;
  account_balance: number;
  expires_at: string;
  orders: Array<{ code: string; sale_date: string; due_date: string; balance: number }>;
  activities: Array<{
    id: string;
    date: string;
    kind: string;
    description?: string;
    reference: string;
    debit?: number;
    credit?: number;
    balance?: number;
    amount: number;
    direction: 'charge' | 'payment';
  }>;
  activity_has_more?: boolean;
}
export interface ExternalDocumentLine {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}
export interface ExternalDocumentPayment {
  method: string;
  amount: number;
  reference: string | null;
  date: string;
}
export interface ExternalDocument {
  document_type: 'receipt' | 'invoice' | 'proforma' | 'purchase_order';
  document_number: string;
  company_name: string;
  company_address: string | null;
  company_whatsapp: string | null;
  company_logo_path: string | null;
  party_name: string;
  issue_date: string;
  valid_until: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  notes: string | null;
  lines: ExternalDocumentLine[];
  payments: ExternalDocumentPayment[];
  expires_at: string;
  show_vat_breakdown?: boolean;
  vat_registered?: boolean;
  tax_registration_number?: string | null;
  tax_document_number?: string | null;
  gross_total?: number;
  net_total?: number;
  tax_total?: number;
  tax_breakdown?: Array<{
    code: string;
    classification: string;
    rate_bps: number;
    gross: number;
    net: number;
    tax: number;
  }>;
}

const DIRECTORY_KEY = makeStateKey<StorefrontInfo[]>('storefront:directory');
const shopKey = (slug: string) => makeStateKey<StorefrontInfo | null>(`storefront:shop:${slug}`);
const catalogPageKey = (slug: string, limit: number, offset: number) =>
  makeStateKey<CatalogPage>(`storefront:catalog:${slug}:${limit}:${offset}`);
const categoriesKey = (slug: string) =>
  makeStateKey<ShopCategory[]>(`storefront:categories:${slug}`);

/**
 * Anonymous read-only access to the public storefront surface.
 * No authentication. This bare client uses the anonymous key. RLS and security-definer RPCs gate the data.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontService {
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  private readonly fixtureShop: StorefrontInfo = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Fixture Shop',
    slug: 'fixture-shop',
    logo_path: null,
    public_whatsapp_number: '+254700000000',
    catalogue_visible: true,
  };
  private readonly fixtureCatalog: CatalogRow[] = [
    {
      available: true,
      image_path: '',
      kind: 'stock',
      manufacturer_id: '00000000-0000-0000-0000-000000000002',
      manufacturer_name: 'Fixture Foods',
      price: 165,
      product_id: '00000000-0000-0000-0000-000000000003',
      product_name: 'Fixture Sugar 1kg',
      sku: 'FIX-SUGAR-1KG',
      total_count: 3,
      variant_id: '00000000-0000-0000-0000-000000000004',
      variant_name: 'Default',
    },
    {
      available: true,
      image_path: '',
      kind: 'stock',
      manufacturer_id: '00000000-0000-0000-0000-000000000002',
      manufacturer_name: 'Fixture Foods',
      price: 320,
      product_id: '00000000-0000-0000-0000-000000000005',
      product_name: 'Fixture Tea 100 bags',
      sku: 'FIX-TEA-100',
      total_count: 3,
      variant_id: '00000000-0000-0000-0000-000000000006',
      variant_name: 'Default',
    },
    {
      available: false,
      image_path: '',
      kind: 'stock',
      manufacturer_id: '00000000-0000-0000-0000-000000000007',
      manufacturer_name: 'Fixture Home',
      price: 120,
      product_id: '00000000-0000-0000-0000-000000000008',
      product_name: 'Fixture Bar Soap',
      sku: 'FIX-SOAP-BAR',
      total_count: 3,
      variant_id: '00000000-0000-0000-0000-000000000009',
      variant_name: 'Default',
    },
  ];
  private readonly fixtureCategories: ShopCategory[] = [
    {
      active: true,
      company_id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-01-01T00:00:00.000Z',
      description: 'Everyday food and pantry essentials.',
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Groceries',
      slug: 'groceries',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      active: true,
      company_id: '00000000-0000-0000-0000-000000000001',
      created_at: '2026-01-01T00:00:00.000Z',
      description: 'Useful products for the home.',
      id: '00000000-0000-0000-0000-000000000011',
      name: 'Household',
      slug: 'household',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ];
  private readonly fixtureCategoryIdsByProduct = new Map<string, readonly string[]>([
    ['00000000-0000-0000-0000-000000000003', ['00000000-0000-0000-0000-000000000010']],
    ['00000000-0000-0000-0000-000000000005', ['00000000-0000-0000-0000-000000000010']],
    ['00000000-0000-0000-0000-000000000008', ['00000000-0000-0000-0000-000000000011']],
  ]);

  /** All public storefronts (the directory at `/`). */
  transferredDirectory(): StorefrontInfo[] | null {
    return this.transferState.hasKey(DIRECTORY_KEY)
      ? this.transferState.get(DIRECTORY_KEY, [])
      : null;
  }

  transferredStorefront(slug: string): StorefrontInfo | null | undefined {
    const key = shopKey(slug);
    return this.transferState.hasKey(key) ? this.transferState.get(key, null) : undefined;
  }

  transferredCatalogPage(slug: string, limit = 12, offset = 0): CatalogPage | null {
    const key = catalogPageKey(slug, limit, offset);
    return this.transferState.hasKey(key)
      ? this.transferState.get(key, { rows: [], total: 0, offset })
      : null;
  }

  transferredCategories(slug: string): ShopCategory[] | null {
    const key = categoriesKey(slug);
    return this.transferState.hasKey(key) ? this.transferState.get(key, []) : null;
  }

  async directory(force = false): Promise<StorefrontInfo[]> {
    if (!force && this.transferState.hasKey(DIRECTORY_KEY))
      return this.transferState.get(DIRECTORY_KEY, []);
    const shops =
      environment.publicDataMode === 'fixture'
        ? [this.fixtureShop]
        : await this.track(async () => {
            const { data, error } = await this.client
              .from('public_storefronts')
              .select('*')
              .order('name');
            if (error) throw error;
            return data;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(DIRECTORY_KEY, shops);
    return shops;
  }

  /** Shop identity by slug (null = unknown slug → 404 state). */
  async storefront(slug: string, force = false): Promise<StorefrontInfo | null> {
    const key = shopKey(slug);
    if (!force && this.transferState.hasKey(key)) return this.transferState.get(key, null);
    const shop =
      environment.publicDataMode === 'fixture'
        ? slug === this.fixtureShop.slug
          ? this.fixtureShop
          : null
        : await this.track(async () => {
            const { data, error } = await this.client
              .from('public_storefronts')
              .select('*')
              .eq('slug', slug)
              .maybeSingle();
            if (error) throw error;
            return data;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(key, shop);
    return shop;
  }

  /** One server-side product-family page. No full-catalog cache is created in the browser. */
  async catalogPage(
    slug: string,
    options: {
      search?: string;
      categoryId?: string | null;
      limit?: number;
      offset?: number;
      force?: boolean;
    } = {}
  ): Promise<CatalogPage> {
    const limit = options.limit ?? 12;
    const requestedOffset = options.offset ?? 0;
    const key = catalogPageKey(slug, limit, requestedOffset);
    const cacheable = !options.search?.trim() && !options.categoryId;
    if (!options.force && cacheable && this.transferState.hasKey(key)) {
      return this.transferState.get(key, { rows: [], total: 0, offset: requestedOffset });
    }
    const fixtureSearch = options.search?.trim().toLowerCase();
    const fixtureRows = this.fixtureCatalog.filter(row => {
      const matchesSearch =
        !fixtureSearch ||
        [row.product_name, row.manufacturer_name, row.sku].some(value =>
          value?.toLowerCase().includes(fixtureSearch)
        );
      const matchesCategory =
        !options.categoryId ||
        this.fixtureCategoryIdsByProduct.get(row.product_id)?.includes(options.categoryId);
      return matchesSearch && matchesCategory;
    });
    const page =
      environment.publicDataMode === 'fixture'
        ? {
            rows: fixtureRows.slice(requestedOffset, requestedOffset + limit),
            total: fixtureRows.length,
            offset: requestedOffset,
          }
        : await this.track(async () => {
            const search = options.search?.trim();
            const categoryId = options.categoryId;
            const fetchPage = async (offset: number): Promise<CatalogPage> => {
              const { data, error } = await this.client.rpc('storefront_catalog_page', {
                p_slug: slug,
                p_limit: limit,
                p_offset: offset,
                ...(search ? { p_search: search } : {}),
                ...(categoryId ? { p_category_id: categoryId } : {}),
              });
              if (error) throw error;
              return { rows: data, total: Number(data[0]?.total_count ?? 0), offset };
            };

            const requestedPage = await fetchPage(requestedOffset);
            if (requestedPage.rows.length > 0 || requestedOffset === 0) return requestedPage;

            const firstPage = await fetchPage(0);
            if (firstPage.total === 0) return firstPage;
            const lastOffset = Math.floor((firstPage.total - 1) / limit) * limit;
            return lastOffset === 0 ? firstPage : fetchPage(lastOffset);
          });
    if (isPlatformServer(this.platformId) && cacheable) this.transferState.set(key, page);
    return page;
  }

  /** The variants needed by one product detail route only. */
  async product(slug: string, productId: string): Promise<CatalogRow[]> {
    if (environment.publicDataMode === 'fixture') {
      return slug === this.fixtureShop.slug
        ? this.fixtureCatalog.filter(row => row.product_id === productId)
        : [];
    }
    return this.track(async () => {
      const { data, error } = await this.client.rpc('storefront_product', {
        p_slug: slug,
        p_product_id: productId,
      });
      if (error) throw error;
      return data;
    });
  }

  /** Active categories for the shop. */
  async categories(slug: string, force = false): Promise<ShopCategory[]> {
    const key = categoriesKey(slug);
    if (!force && this.transferState.hasKey(key)) return this.transferState.get(key, []);
    const categories =
      environment.publicDataMode === 'fixture'
        ? this.fixtureCategories
        : await this.track(async () => {
            const { data, error } = await this.client.rpc('storefront_categories', {
              p_slug: slug,
            });
            if (error) throw error;
            return data;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(key, categories);
    return categories;
  }

  /** Public product-image URL from a storage path. */
  imageUrl(path: string | null): string | null {
    if (!path) return null;
    return `${environment.supabaseUrl}/storage/v1/object/public/product-images/${path}`;
  }

  companyLogoUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${environment.supabaseUrl}/storage/v1/object/public/company-logos/${path}`;
  }

  legalUrl(path: 'privacy' | 'terms'): string {
    return `${environment.sitePublicUrl.replace(/\/$/, '')}/${path}`;
  }

  async customerStatement(
    token: string,
    cursor?: { date: string; id: string }
  ): Promise<CustomerStatement | null> {
    return this.track(async () => {
      const { data, error } = await this.client.rpc('public_customer_statement', {
        p_token: token,
        p_before_date: cursor?.date,
        p_before_id: cursor?.id,
        p_limit: 25,
      });
      if (error) throw error;
      return data as unknown as CustomerStatement | null;
    });
  }

  async externalDocument(token: string): Promise<ExternalDocument | null> {
    return this.track(async () => {
      const { data, error } = await this.client.rpc('public_external_document', { p_token: token });
      if (error) throw error;
      return data as unknown as ExternalDocument | null;
    });
  }

  private track<T>(task: () => Promise<T>): Promise<T> {
    const done = this.pendingTasks.add();
    return task().finally(done);
  }
}
