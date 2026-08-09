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
export type ShopCollection =
  Database['public']['Functions']['storefront_collections']['Returns'][number];
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
  expires_at: string;
  orders: Array<{ code: string; sale_date: string; due_date: string; balance: number }>;
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
}

const DIRECTORY_KEY = makeStateKey<StorefrontInfo[]>('storefront:directory');
const shopKey = (slug: string) => makeStateKey<StorefrontInfo | null>(`storefront:shop:${slug}`);

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

  async prerenderSlugs(): Promise<string[]> {
    return (await this.directory())
      .map(shop => shop.slug)
      .filter((slug): slug is string => Boolean(slug));
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
      collectionId?: string | null;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<CatalogPage> {
    if (environment.publicDataMode === 'fixture') return { rows: [], total: 0, offset: 0 };
    return this.track(async () => {
      const limit = options.limit ?? 12;
      const requestedOffset = options.offset ?? 0;
      const fetchPage = async (offset: number): Promise<CatalogPage> => {
        const { data, error } = await this.client.rpc('storefront_catalog_page', {
          p_slug: slug,
          p_search: options.search?.trim() || null,
          p_collection_id: options.collectionId ?? null,
          p_limit: limit,
          p_offset: offset,
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
  }

  /** The variants needed by one product detail route only. */
  async product(slug: string, productId: string): Promise<CatalogRow[]> {
    if (environment.publicDataMode === 'fixture') return [];
    return this.track(async () => {
      const { data, error } = await this.client.rpc('storefront_product', {
        p_slug: slug,
        p_product_id: productId,
      });
      if (error) throw error;
      return data;
    });
  }

  /** Active collections for the shop. */
  async collections(slug: string): Promise<ShopCollection[]> {
    if (environment.publicDataMode === 'fixture') return [];
    return this.track(async () => {
      const { data, error } = await this.client.rpc('storefront_collections', { p_slug: slug });
      if (error) throw error;
      return data;
    });
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

  async customerStatement(token: string): Promise<CustomerStatement | null> {
    return this.track(async () => {
      const { data, error } = await this.client.rpc('public_customer_statement', {
        p_token: token,
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
