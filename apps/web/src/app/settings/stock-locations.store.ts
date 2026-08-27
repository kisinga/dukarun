import { Injectable, inject, signal } from '@angular/core';
import { EntitlementsService } from '../core/entitlements.service';
import { SettingsService, type StockLocationRow } from './settings.service';

@Injectable({ providedIn: 'root' })
export class StockLocationsStore {
  private readonly settingsService = inject(SettingsService);
  private readonly entitlements = inject(EntitlementsService);
  private loadPromise: Promise<StockLocationRow[]> | null = null;
  private loadRequest = 0;

  private readonly locationsState = signal<StockLocationRow[]>([]);
  readonly locations = this.locationsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();

  async load(force = false): Promise<StockLocationRow[]> {
    if (!force && this.locations().length > 0) return this.locations();
    if (this.loadPromise && !force) return this.loadPromise;
    const request = ++this.loadRequest;
    this.loadingState.set(true);
    this.errorState.set(null);
    const load = this.settingsService
      .stockLocations()
      .then(locations => {
        if (request === this.loadRequest) this.locationsState.set(locations);
        return locations;
      })
      .catch(error => {
        const message =
          error instanceof Error ? error.message : 'Stock locations could not be loaded.';
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

  async create(code: string, name: string, isDefault: boolean): Promise<string> {
    const id = await this.settingsService.createStockLocation(code, name, isDefault);
    await this.reloadAfterMutation();
    return id;
  }

  async update(id: string, code: string, name: string, isDefault: boolean): Promise<string> {
    const result = await this.settingsService.updateStockLocation(id, code, name, isDefault);
    await this.reloadAfterMutation();
    return result;
  }

  async delete(id: string): Promise<string> {
    const result = await this.settingsService.deleteStockLocation(id);
    await this.reloadAfterMutation();
    return result;
  }

  private async reloadAfterMutation(): Promise<void> {
    await Promise.all([this.load(true), this.entitlements.refresh()]);
  }
}
