import { Injectable, computed, inject, signal } from '@angular/core';
import type { GetActiveChannelQuery, GetUserChannelsQuery } from '../graphql/generated/graphql';
import { GET_ACTIVE_CHANNEL, GET_USER_CHANNELS } from '../graphql/operations.graphql';
import type { Company } from '../models/company.model';
import { AppCacheService } from './cache/app-cache.service';
import { ApolloService } from './apollo.service';

const COMPANY_SESSION_CACHE_KEY = 'company_session';

/** Session shape persisted via AppCacheService (global scope). */
interface CompanySession {
  companies: Company[];
  activeCompanyId: string | null;
  channelData: GetActiveChannelQuery['activeChannel'] | null;
}

/**
 * Manages company (channel) selection and active channel data.
 *
 * - Channel = company. Active channel data (custom fields, currency, etc.) is fetched and cached.
 * - Token for the active company is synced to ApolloService so all API calls use the correct channel.
 * - Session is persisted via AppCacheService (global) and restored on init; channel data is refetched when needed.
 */
@Injectable({
  providedIn: 'root',
})
export class CompanyService {
  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);

  // --- State ---
  private readonly companiesSignal = signal<Company[]>([]);
  private readonly activeCompanyIdSignal = signal<string | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly activeChannelDataSignal = signal<GetActiveChannelQuery['activeChannel'] | null>(
    null,
  );

  // --- Public read-only ---
  readonly companies = this.companiesSignal.asReadonly();
  readonly activeCompanyId = this.activeCompanyIdSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly activeChannel = computed(() => this.activeChannelDataSignal());

  readonly activeCompany = computed(() => {
    const id = this.activeCompanyIdSignal();
    return this.companiesSignal().find((c) => c.id === id) ?? null;
  });

  constructor() {
    this.apolloService.onChannelNotFound(() => this.clearActiveCompany());
  }

  getChannelToken(): string | null {
    return this.activeCompany()?.token ?? null;
  }

  // --- Derived from active channel (computed) ---
  readonly mlModelAssets = computed(() => {
    const cf = this.activeChannelDataSignal()?.customFields;
    if (!cf?.mlModelJsonAsset || !cf?.mlModelBinAsset || !cf?.mlMetadataAsset) return null;
    return {
      mlModelJsonAsset: cf.mlModelJsonAsset,
      mlModelBinAsset: cf.mlModelBinAsset,
      mlMetadataAsset: cf.mlMetadataAsset,
    };
  });

  readonly companyLogoAsset = computed(
    () => this.activeChannelDataSignal()?.customFields?.companyLogoAsset ?? null,
  );

  readonly companyLogoUrl = computed(() => {
    const asset = this.companyLogoAsset();
    if (!asset) return null;
    const url = asset.preview ?? asset.source;
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return new URL(url).pathname;
    if (url.startsWith('/')) return url;
    return asset.source ? `/assets/${asset.source}` : url;
  });

  readonly cashierFlowEnabled = computed(
    () => this.activeChannelDataSignal()?.customFields?.cashierFlowEnabled ?? false,
  );
  readonly enablePrinter = computed(
    () => this.activeChannelDataSignal()?.customFields?.enablePrinter ?? true,
  );
  readonly channelCurrency = computed(
    () => this.activeChannelDataSignal()?.defaultCurrencyCode ?? 'KES',
  );
  readonly subscriptionStatus = computed(
    () => this.activeChannelDataSignal()?.customFields?.subscriptionStatus ?? 'trial',
  );
  readonly trialEndsAt = computed(() => {
    const t = this.activeChannelDataSignal()?.customFields?.trialEndsAt;
    return t ? new Date(t) : null;
  });
  readonly subscriptionExpiresAt = computed(() => {
    const t = this.activeChannelDataSignal()?.customFields?.subscriptionExpiresAt;
    return t ? new Date(t) : null;
  });

  readonly companyDisplayName = computed(() => {
    const code = this.activeCompany()?.code ?? '';
    return code.length > 10 ? code.slice(0, 10) + '...' : code;
  });

  readonly isTrialActive = computed(() => {
    if (this.subscriptionStatus() !== 'trial') return false;
    const ends = this.trialEndsAt();
    return ends ? ends > new Date() : false;
  });
  readonly isSubscriptionActive = computed(() => {
    if (this.subscriptionStatus() !== 'active') return false;
    const expires = this.subscriptionExpiresAt();
    return expires ? expires > new Date() : false;
  });
  readonly isSubscriptionExpired = computed(() => {
    const s = this.subscriptionStatus();
    return s === 'expired' || s === 'cancelled';
  });

  // --- Persistence and sync (single place, uses AppCacheService) ---
  private async persistAndSync(): Promise<void> {
    this.apolloService.setChannelToken(this.activeCompany()?.token ?? null);
    const session: CompanySession = {
      companies: this.companiesSignal(),
      activeCompanyId: this.activeCompanyIdSignal(),
      channelData: this.activeChannelDataSignal(),
    };
    await this.appCache.setKV('global', COMPANY_SESSION_CACHE_KEY, session);
  }

  /** Set active company id, persist, sync token, and fetch channel data. */
  private applyActiveCompany(): void {
    void this.persistAndSync();
    void this.fetchActiveChannel();
  }

  // --- Public API ---

  /**
   * Restore session from cache. Call once after auth is established.
   * Refetches channel data in background when an active company is present.
   */
  async initializeFromCache(): Promise<void> {
    const session = await this.appCache.getKV<CompanySession>('global', COMPANY_SESSION_CACHE_KEY);
    if (!session) return;
    this.companiesSignal.set(session.companies ?? []);
    this.activeCompanyIdSignal.set(session.activeCompanyId ?? null);
    this.activeChannelDataSignal.set(session.channelData ?? null);
    this.apolloService.setChannelToken(this.activeCompany()?.token ?? null);
    if (this.activeCompany()) void this.fetchActiveChannel();
  }

  /**
   * Set companies from server (e.g. after login). Validates or sets active company, then refreshes channel.
   */
  setCompaniesFromChannels(channels: Array<{ id: string; code: string; token: string }>): void {
    const companies: Company[] = channels.map((c) => ({ id: c.id, code: c.code, token: c.token }));
    this.companiesSignal.set(companies);
    const currentId = this.activeCompanyIdSignal();
    const stillInList = companies.some((c) => c.id === currentId);
    const effectiveId = stillInList ? currentId : (companies[0]?.id ?? null);
    if (effectiveId) {
      if (effectiveId !== currentId) this.activeCompanyIdSignal.set(effectiveId);
      this.applyActiveCompany();
    }
  }

  /**
   * Activate a company by id. Fetches channel data and persists session.
   */
  activateCompany(companyId: string): void {
    const company = this.companiesSignal().find((c) => c.id === companyId);
    if (!company) return;
    this.activeCompanyIdSignal.set(companyId);
    this.applyActiveCompany();
  }

  /**
   * Fetch active channel from API and update cache. Called on activate and after restore.
   */
  async fetchActiveChannel(): Promise<void> {
    try {
      const result = await this.apolloService.getClient().query<GetActiveChannelQuery>({
        query: GET_ACTIVE_CHANNEL,
        fetchPolicy: 'network-only',
      });
      const channel = result.data?.activeChannel ?? null;
      this.activeChannelDataSignal.set(channel);
      if (channel) await this.persistAndSync();
    } catch {
      this.activeChannelDataSignal.set(null);
    }
  }

  /**
   * Fetch user channels from API. Typically called after auth; use setCompaniesFromChannels to apply.
   */
  async fetchUserChannels(): Promise<void> {
    this.isLoadingSignal.set(true);
    try {
      const result = await this.apolloService.getClient().query<GetUserChannelsQuery>({
        query: GET_USER_CHANNELS,
        fetchPolicy: 'network-only',
        context: { skipChannelToken: true },
      });
      const channels = result.data?.me?.channels;
      if (channels) this.setCompaniesFromChannels(channels);
      else this.companiesSignal.set([]);
    } catch {
      this.companiesSignal.set([]);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /** Clear all company state and token. Use on logout or channel-not-found. */
  clearActiveCompany(): void {
    this.activeCompanyIdSignal.set(null);
    this.activeChannelDataSignal.set(null);
    this.companiesSignal.set([]);
    this.apolloService.setChannelToken(null);
    void this.appCache.removeKV('global', COMPANY_SESSION_CACHE_KEY);
  }
}
