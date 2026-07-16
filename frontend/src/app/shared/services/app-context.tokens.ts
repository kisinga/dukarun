import { InjectionToken, Signal, signal } from '@angular/core';
import type { Company } from '../models/company.model';

/**
 * Read-only slice of company/channel state that shared infrastructure
 * (currency, print, cache, drafts) may consume without importing the
 * company domain. Implemented by `CompanyService` (domains/company) and
 * registered via `useExisting` in the shell app config.
 *
 * A root-level default factory is provided so unit tests that import
 * individual services do not need to wire the full application config.
 * The real app overrides this with `CompanyService`.
 */
export interface CompanyContext {
  readonly activeCompanyId: Signal<string | null>;
  readonly activeCompany: Signal<Company | null>;
  readonly channelCurrency: Signal<string>;
  readonly companyLogoAsset: Signal<{ preview?: string | null; source?: string | null } | null>;
  getChannelToken(): string | null;
  clearActiveCompany(): void;
  setCompaniesFromChannels(channels: Array<{ id: string; code: string; token: string }>): void;
}

const FALLBACK_CURRENCY = 'USD';

class DefaultCompanyContext implements CompanyContext {
  readonly activeCompanyId = signal<string | null>(null);
  readonly activeCompany = signal<Company | null>(null);
  // Test fallback only; the real app overrides this token with CompanyService.
  readonly channelCurrency = signal<string>(FALLBACK_CURRENCY);
  readonly companyLogoAsset = signal<{ preview?: string | null; source?: string | null } | null>(
    null,
  );

  getChannelToken(): string | null {
    return null;
  }

  clearActiveCompany(): void {
    this.activeCompanyId.set(null);
    this.activeCompany.set(null);
  }

  setCompaniesFromChannels(): void {
    // no-op default
  }
}

export const COMPANY_CONTEXT = new InjectionToken<CompanyContext>('COMPANY_CONTEXT', {
  providedIn: 'root',
  factory: () => new DefaultCompanyContext(),
});

/**
 * Clears all app-level caches (apollo, domain caches, session state).
 * Implemented by the shell's `AppInitService` and registered via
 * `useExisting` in the shell app config, so domains (e.g. auth login)
 * can trigger a full reset without importing shell code.
 */
export interface AppCacheReset {
  clearCache(): void;
}

class DefaultAppCacheReset implements AppCacheReset {
  clearCache(): void {
    // no-op default for tests
  }
}

export const APP_CACHE_RESET = new InjectionToken<AppCacheReset>('APP_CACHE_RESET', {
  providedIn: 'root',
  factory: () => new DefaultAppCacheReset(),
});

/**
 * Whether the current user may view financial figures. Implemented by
 * `AuthService` (domains/auth) and registered via `useExisting` in the
 * shell app config, so shared UI (e.g. MoneyComponent) can mask sensitive
 * amounts without importing the auth domain.
 */
export interface FinancialAccess {
  canViewFinancials(): boolean;
}

class DefaultFinancialAccess implements FinancialAccess {
  canViewFinancials(): boolean {
    // Fail closed: financial data should be hidden unless the app explicitly
    // bridges this token to an auth service that grants access.
    return false;
  }
}

export const FINANCIAL_ACCESS = new InjectionToken<FinancialAccess>('FINANCIAL_ACCESS', {
  providedIn: 'root',
  factory: () => new DefaultFinancialAccess(),
});
