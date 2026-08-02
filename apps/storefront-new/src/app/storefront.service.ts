import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../environments/environment';

export type StorefrontInfo = Database['public']['Views']['public_storefronts']['Row'];
export type CatalogRow = Database['public']['Functions']['storefront_catalog']['Returns'][number];
export type ShopCollection =
  Database['public']['Functions']['storefront_collections']['Returns'][number];

/**
 * Anonymous read-only access to the public storefront surface.
 * No auth — bare client with the anon key; RLS/security-definer RPCs gate the data.
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
}
