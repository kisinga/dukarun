import { computed, inject, signal, Signal, WritableSignal } from '@angular/core';
import { AppCacheService } from '../cache/app-cache.service';
import { CompanyService } from '../company.service';

/**
 * Base draft service for managing draft state with caching
 *
 * Provides reusable patterns for:
 * - State management with signals
 * - Channel-specific caching
 * - Auto-persistence on changes
 *
 * Follows LOB principle: single source of truth with local caching
 */
export abstract class DraftBaseService<T> {
  protected readonly appCache = inject(AppCacheService);
  protected readonly companyService = inject(CompanyService);

  // State signals
  protected readonly draftSignal: WritableSignal<T | null>;
  protected readonly isLoadingSignal: WritableSignal<boolean>;
  protected readonly isLoadingFromCacheSignal: WritableSignal<boolean>;
  protected readonly errorSignal: WritableSignal<string | null>;

  // Public readonly signals
  readonly draft: Signal<T | null>;
  readonly isLoading: Signal<boolean>;
  /** True from when loadFromCache runs until the cache read completes. Use to show loading until draft is hydrated. */
  readonly isLoadingFromCache: Signal<boolean>;
  readonly error: Signal<string | null>;

  // Computed signals
  readonly hasDraft: Signal<boolean>;

  constructor(protected readonly cacheKey: string) {
    this.draftSignal = signal<T | null>(null);
    this.isLoadingSignal = signal<boolean>(false);
    this.isLoadingFromCacheSignal = signal<boolean>(false);
    this.errorSignal = signal<string | null>(null);

    this.draft = this.draftSignal.asReadonly();
    this.isLoading = this.isLoadingSignal.asReadonly();
    this.isLoadingFromCache = this.isLoadingFromCacheSignal.asReadonly();
    this.error = this.errorSignal.asReadonly();
    this.hasDraft = computed(() => this.draftSignal() !== null);
  }

  /**
   * Initialize draft: load from cache, then create a new draft only if none was loaded.
   * Call when entering a screen that needs the draft. isLoadingFromCache is true until cache read completes.
   */
  initialize(): void {
    this.loadFromCache(() => {
      if (!this.draftSignal()) {
        this.createNewDraft();
      }
    });
  }

  /**
   * Create a new draft (must be implemented by subclass)
   */
  protected abstract createNew(): void;

  /**
   * Public method to create new draft (calls protected createNew)
   */
  createNewDraft(): void {
    this.createNew();
  }

  /**
   * Load draft from cache (async). Optionally run onDone when the read completes (e.g. to create new draft if empty).
   */
  protected loadFromCache(onDone?: () => void): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) {
      onDone?.();
      return;
    }

    this.isLoadingFromCacheSignal.set(true);
    const scope = `channel:${channelId}` as const;
    this.appCache.getKV<T>(scope, this.cacheKey).then((cached) => {
      if (cached != null) {
        const transformed = this.transformCachedData(cached);
        this.draftSignal.set(transformed);
      }
      this.isLoadingFromCacheSignal.set(false);
      onDone?.();
    });
  }

  /**
   * Transform cached data (e.g., parse Date strings)
   * Override in subclass if needed
   */
  protected transformCachedData(cached: T): T {
    return cached;
  }

  /**
   * Persist draft to cache
   */
  protected persist(): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) return;

    const draft = this.draftSignal();
    if (draft) {
      const scope = `channel:${channelId}` as const;
      this.appCache.setKV(scope, this.cacheKey, draft);
    }
  }

  /**
   * Clear draft and cache
   */
  clear(): void {
    this.draftSignal.set(null);
    this.clearCache();
  }

  /**
   * Clear cache
   */
  protected clearCache(): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) return;

    const scope = `channel:${channelId}` as const;
    this.appCache.removeKV(scope, this.cacheKey);
  }

  /**
   * Update draft field (protected, can be overridden)
   */
  protected updateField<K extends keyof T>(field: K, value: T[K]): void {
    const draft = this.draftSignal();
    if (!draft) {
      this.createNewDraft();
      return;
    }

    this.draftSignal.set({
      ...draft,
      [field]: value,
    });
    this.persist();
  }

  /**
   * Set loading state (public for orchestration services)
   */
  setLoading(loading: boolean): void {
    this.isLoadingSignal.set(loading);
  }

  /**
   * Set error state (public for orchestration services)
   */
  setError(error: string | null): void {
    this.errorSignal.set(error);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.errorSignal.set(null);
  }
}
