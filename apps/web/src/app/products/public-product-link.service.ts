import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service';

type PublicStorefrontTarget = { slug: string };

/** Resolves canonical public product links without loading a public product page. */
@Injectable({ providedIn: 'root' })
export class PublicProductLinkService {
  private readonly supabase = inject(SupabaseService);
  private readonly target = signal<PublicStorefrontTarget | null | undefined>(undefined);
  private targetLoad: Promise<PublicStorefrontTarget | null> | null = null;

  load(force = false): Promise<PublicStorefrontTarget | null> {
    const loaded = this.target();
    if (!force && loaded !== undefined) return Promise.resolve(loaded);
    if (this.targetLoad) return this.targetLoad;

    const load = this.resolveTarget().finally(() => {
      if (this.targetLoad === load) this.targetLoad = null;
    });
    this.targetLoad = load;
    return load;
  }

  async productUrl(productId: string): Promise<string | null> {
    // Storefront visibility and slugs can change elsewhere in the SPA. Resolve
    // again at share time so a cached target never produces a stale public URL.
    const target = await this.load(true);
    if (!target) return null;
    return new URL(
      `/${encodeURIComponent(target.slug)}/products/${encodeURIComponent(productId)}`,
      `${environment.storefrontPublicUrl.replace(/\/+$/, '')}/`
    ).toString();
  }

  private async resolveTarget(): Promise<PublicStorefrontTarget | null> {
    let identity = this.supabase.offlineIdentity();
    if (!identity) {
      await this.supabase.initializeSession();
      identity = this.supabase.offlineIdentity();
    }
    return identity ? this.fetchTarget(identity.companyId) : null;
  }

  private async fetchTarget(companyId: string): Promise<PublicStorefrontTarget | null> {
    try {
      const { data, error } = await this.supabase.client
        .from('public_storefronts')
        .select('slug,catalogue_visible')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      const target = data?.slug && data.catalogue_visible ? { slug: data.slug } : null;
      this.target.set(target);
      return target;
    } catch (error) {
      // A transient connection failure should remain retryable on the share tap.
      this.target.set(undefined);
      throw error;
    }
  }
}
