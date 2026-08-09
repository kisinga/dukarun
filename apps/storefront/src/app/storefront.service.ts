import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../environments/environment';

export type StorefrontInfo = Database['public']['Views']['public_storefronts']['Row'];
export type CatalogRow = Database['public']['Functions']['storefront_catalog']['Returns'][number];
export type ShopCollection =
  Database['public']['Functions']['storefront_collections']['Returns'][number];
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

/**
 * Anonymous read-only access to the public storefront surface.
 * No authentication. This bare client uses the anonymous key. RLS and security-definer RPCs gate the data.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontService {
  private readonly client: SupabaseClient<Database> = createClient<Database>(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    { auth: { persistSession: false } }
  );

  /** All public storefronts (the directory at `/`). */
  async directory(): Promise<StorefrontInfo[]> {
    const { data, error } = await this.client.from('public_storefronts').select('*').order('name');
    if (error) throw error;
    return data;
  }

  /** Shop identity by slug (null = unknown slug → 404 state). */
  async storefront(slug: string): Promise<StorefrontInfo | null> {
    const { data, error } = await this.client
      .from('public_storefronts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Catalog rows for a slug. Empty when the shop lapsed or hid the catalogue. */
  async catalog(slug: string): Promise<CatalogRow[]> {
    const { data, error } = await this.client.rpc('storefront_catalog', { p_slug: slug });
    if (error) throw error;
    return data;
  }

  /** Active collections for the shop. */
  async collections(slug: string): Promise<ShopCollection[]> {
    const { data, error } = await this.client.rpc('storefront_collections', { p_slug: slug });
    if (error) throw error;
    return data;
  }

  /** Public product-image URL from a storage path. */
  imageUrl(path: string | null): string | null {
    if (!path) return null;
    return `${environment.supabaseUrl}/storage/v1/object/public/product-images/${path}`;
  }

  legalUrl(path: 'privacy' | 'terms'): string {
    return `${environment.webPublicUrl.replace(/\/$/, '')}/${path}`;
  }

  async customerStatement(token: string): Promise<CustomerStatement | null> {
    const { data, error } = await this.client.rpc('public_customer_statement', { p_token: token });
    if (error) throw error;
    return data as unknown as CustomerStatement | null;
  }
}
