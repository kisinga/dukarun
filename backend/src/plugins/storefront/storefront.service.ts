import { Injectable, Logger } from '@nestjs/common';
import {
  Asset,
  Channel,
  CollectionService,
  ProductService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
} from '@vendure/core';

import { normalizeStorefrontSlug } from '../../utils/storefront-slug.util';

/** Resolved public storefront identity for a single merchant channel. */
export interface StorefrontResult {
  channel: Channel;
  channelToken: string;
  name: string;
  slug: string;
  logo: Asset | null;
  whatsappNumber: string | null;
  /** True only when the channel's subscription is active/trialing. When false the storefront
   *  should show branding but hide the catalogue (and be marked noindex). */
  catalogueVisible: boolean;
}

/** A single URL for a channel's sitemap. `loc` is a path (e.g. /products/rice). */
export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

/** Hard cap on sitemap entries per type — pilot scale. Overflow is logged, never silently dropped. */
const MAX_SITEMAP_ENTRIES = 5000;

/** Hard cap on stores returned to the discovery directory. */
const MAX_DIRECTORY_STORES = 200;

/**
 * StorefrontService — the single source of truth for "is this slug an eligible public storefront,
 * and what is its public identity + catalogue?". Shared by the shop-api resolver and the
 * sitemap/robots controller so gating logic never diverges.
 */
@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly requestContextService: RequestContextService,
    private readonly productService: ProductService,
    private readonly collectionService: CollectionService
  ) {}

  /**
   * Resolve an eligible public storefront by its subdomain slug. Channel-agnostic (looks the
   * channel up directly, ignoring the request's active channel). Returns null when the channel
   * does not exist, has not opted in, or is not APPROVED.
   */
  async resolveStorefront(ctx: RequestContext, slug: string): Promise<StorefrontResult | null> {
    const clean = normalizeStorefrontSlug(slug);
    if (!clean) return null;

    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      // `as any`: the custom field isn't in Vendure's generated where-type, but TypeORM maps the
      // embedded `customFieldsPublicslug` column at runtime (verified). Do not "fix" into a bare
      // `where: { publicSlug }` — that would target a non-existent top-level column.
      where: { customFields: { publicSlug: clean } as any },
      relations: ['seller', 'customFields.companyLogoAsset'],
    });
    if (!channel) return null;
    return this.buildResult(channel);
  }

  /**
   * List all browsable public storefronts (opted-in + APPROVED + active subscription). Powers the
   * discovery/directory page. Lapsed stores are excluded so they don't appear as browsable.
   */
  async listStorefronts(ctx: RequestContext): Promise<StorefrontResult[]> {
    const channels = await this.connection.getRepository(ctx, Channel).find({
      // `as any`: Vendure's generated CustomChannelFields type doesn't statically include our added
      // fields, but TypeORM maps the embedded `customFieldsPublicstorefrontenabled` column at runtime.
      where: { customFields: { publicStorefrontEnabled: true } as any },
      relations: ['seller', 'customFields.companyLogoAsset'],
      order: { code: 'ASC' },
      take: MAX_DIRECTORY_STORES,
    });
    return channels
      .map(ch => this.buildResult(ch))
      .filter((r): r is StorefrontResult => r !== null && r.catalogueVisible && !!r.slug);
  }

  /** Gate + shape a channel into a StorefrontResult, or null if it is not an eligible public store. */
  private buildResult(channel: Channel): StorefrontResult | null {
    const cf = channel.customFields as Record<string, any>;
    if (cf.publicStorefrontEnabled !== true) return null;
    if (cf.status !== 'APPROVED') return null;
    return {
      channel,
      channelToken: channel.token,
      name: this.deriveName(channel),
      slug: (cf.publicSlug as string) ?? '',
      logo: (cf.companyLogoAsset as Asset) ?? null,
      whatsappNumber: (cf.publicWhatsAppNumber as string) ?? null,
      catalogueVisible: this.isCatalogueVisible(cf),
    };
  }

  /** As {@link resolveStorefront} but builds its own default-channel context (for REST controllers). */
  async resolveStorefrontBySlug(slug: string): Promise<StorefrontResult | null> {
    const ctx = await this.requestContextService.create({ apiType: 'shop' });
    return this.resolveStorefront(ctx, slug);
  }

  /** Product + collection URLs for a channel's sitemap, scoped to that channel. */
  async getSitemapEntries(channel: Channel): Promise<SitemapEntry[]> {
    const ctx = await this.requestContextService.create({
      apiType: 'shop',
      channelOrToken: channel,
    });
    const entries: SitemapEntry[] = [];

    // Paginate — Vendure caps a single list query (shopListQueryLimit, default 100), so we page
    // through up to MAX_SITEMAP_ENTRIES rather than requesting everything at once.
    const products = await this.collectPaginated(
      (skip, take) => this.productService.findAll(ctx, { skip, take }, []),
      channel.code,
      'products'
    );
    for (const p of products) {
      if (p.enabled && p.slug) {
        entries.push({ loc: `/products/${p.slug}`, lastmod: this.toIso(p.updatedAt) });
      }
    }

    const collections = await this.collectPaginated(
      (skip, take) => this.collectionService.findAll(ctx, { skip, take }),
      channel.code,
      'collections'
    );
    for (const c of collections) {
      if (!c.isPrivate && c.slug) {
        entries.push({ loc: `/collections/${c.slug}`, lastmod: this.toIso(c.updatedAt) });
      }
    }

    return entries;
  }

  /**
   * Page through a Vendure `findAll`-style list (100 at a time) up to MAX_SITEMAP_ENTRIES.
   * Overflow beyond the cap is logged, never silently dropped.
   */
  private async collectPaginated<T>(
    fetchPage: (skip: number, take: number) => Promise<{ items: T[]; totalItems: number }>,
    channelCode: string,
    label: string
  ): Promise<T[]> {
    const PAGE = 100;
    const collected: T[] = [];
    let total = 0;
    for (let skip = 0; collected.length < MAX_SITEMAP_ENTRIES; skip += PAGE) {
      const page = await fetchPage(skip, PAGE);
      total = page.totalItems;
      collected.push(...page.items);
      if (page.items.length === 0 || skip + PAGE >= total) break;
    }
    if (total > MAX_SITEMAP_ENTRIES) {
      this.logger.warn(
        `Sitemap for channel "${channelCode}" capped at ${MAX_SITEMAP_ENTRIES}/${total} ${label}`
      );
    }
    return collected;
  }

  /**
   * Public display name. Merchants are provisioned with a Seller named "<companyName> Seller"
   * (see SellerProvisionerService), so we reverse that known suffix to get the merchant's name.
   * Falls back to the channel code.
   */
  private deriveName(channel: Channel): string {
    const sellerName = channel.seller?.name?.trim();
    if (sellerName) {
      return sellerName.replace(/\s+Seller$/i, '').trim() || sellerName;
    }
    return channel.code;
  }

  /** Catalogue is visible while the subscription is active or trialing and not past its end date. */
  private isCatalogueVisible(cf: Record<string, any>): boolean {
    const now = Date.now();
    const notPast = (d: unknown) => (d ? new Date(d as string).getTime() > now : true);
    switch (cf.subscriptionStatus) {
      case 'active':
        return notPast(cf.subscriptionExpiresAt);
      case 'trial':
        return notPast(cf.trialEndsAt);
      default:
        return false; // expired / cancelled / unknown
    }
  }

  private toIso(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t.toISOString();
  }
}
