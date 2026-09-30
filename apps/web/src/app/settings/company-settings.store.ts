import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import type { DocumentDesign, DocumentKind, ShopSetupState } from '@dukarun/documents';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { CompanySettings, SettingsService } from './settings.service';

/**
 * Shared facade for the company settings row.
 *
 * Settings tab children use this directly so the parent shell does not become a pass-through for
 * forms and save events. The store de-duplicates loads, keeps optimistic local state after updates,
 * and centralizes side effects that belong to the company settings domain, such as receipt cache
 * invalidation after logo changes.
 */
@Injectable({ providedIn: 'root' })
export class CompanySettingsStore {
  private readonly settingsService = inject(SettingsService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly supabase = inject(SupabaseService);
  private scope = this.currentScope();
  private loadPromise: Promise<CompanySettings> | null = null;
  private loadRequest = 0;

  private readonly settingsState = signal<CompanySettings | null>(null);
  readonly settings = this.settingsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();

  constructor() {
    effect(() => {
      const scope = this.currentScope();
      if (scope === this.scope) return;
      this.scope = scope;
      this.loadRequest++;
      this.loadPromise = null;
      this.settingsState.set(null);
      this.loadingState.set(false);
      this.errorState.set(null);
      this.receiptData.invalidateCompanyInfo();
    });
  }

  private currentScope(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `${identity.companyId}:${identity.userId}` : null;
  }

  async load(force = false): Promise<CompanySettings> {
    const current = this.settings();
    if (current && !force) return current;
    if (this.loadPromise && !force) return this.loadPromise;
    const request = ++this.loadRequest;
    this.loadingState.set(true);
    this.errorState.set(null);
    const load = this.settingsService
      .getSettings()
      .then(settings => {
        if (request === this.loadRequest) this.settingsState.set(settings);
        return settings;
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : 'Settings could not be loaded.';
        if (request === this.loadRequest) this.errorState.set(message);
        throw error;
      })
      .finally(() => {
        if (request === this.loadRequest) this.loadingState.set(false);
        if (this.loadPromise === load) this.loadPromise = null;
      });
    this.loadPromise = load;
    return load;
  }

  async update(
    patch: Partial<Omit<CompanySettings, 'id' | 'shop_setup' | 'document_designs'>>
  ): Promise<CompanySettings> {
    const current = this.settings() ?? (await this.load());
    await this.settingsService.updateSettings(current.id, patch);
    const next = { ...(this.settings() ?? current), ...patch };
    if (this.settings()?.id === current.id) this.settingsState.set(next);
    this.receiptData.invalidateCompanyInfo();
    return next;
  }

  patchLocal(patch: Partial<Omit<CompanySettings, 'id'>>): void {
    const current = this.settings();
    if (current) this.settingsState.set({ ...current, ...patch });
    this.receiptData.invalidateCompanyInfo();
  }

  async saveDesign(kind: DocumentKind, design: DocumentDesign): Promise<void> {
    const company = this.settings() ?? (await this.load());
    const saved = await this.settingsService.saveDocumentDesign(kind, design);
    if (this.settings()?.id !== company.id) return;
    this.patchLocal({ document_designs: { ...this.settings()?.document_designs, [kind]: saved } });
  }

  async saveSetup(patch: Partial<ShopSetupState>): Promise<void> {
    const company = this.settings() ?? (await this.load());
    const saved = await this.settingsService.saveShopSetup(patch);
    if (this.settings()?.id === company.id) this.patchLocal({ shop_setup: saved });
  }

  async uploadLogo(file: Blob, ext: string): Promise<string> {
    const current = this.settings() ?? (await this.load());
    const logoPath = await this.settingsService.uploadLogo(current.id, file, ext);
    if (this.settings()?.id === current.id) this.patchLocal({ logo_path: logoPath });
    this.receiptData.invalidateCompanyInfo();
    return logoPath;
  }

  async removeLogo(): Promise<void> {
    const current = this.settings() ?? (await this.load());
    if (!current.logo_path) return;
    await this.settingsService.removeLogo(current.id);
    if (this.settings()?.id === current.id) this.patchLocal({ logo_path: null });
    this.receiptData.invalidateCompanyInfo();
  }

  logoPublicUrl(logoPath: string): string {
    return this.settingsService.logoPublicUrl(logoPath);
  }
}
