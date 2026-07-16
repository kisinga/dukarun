import { inject, Injectable } from '@angular/core';
import { AppCacheService } from './cache/app-cache.service';

const CACHE_KEY = 'print_default_template_id';
const DEFAULT_TEMPLATE_ID = 'receipt-52mm';

@Injectable({
  providedIn: 'root',
})
export class PrintPreferencesService {
  private readonly appCache = inject(AppCacheService);

  async getDefaultTemplateId(): Promise<string> {
    const stored = await this.appCache.getKV<string>('global', CACHE_KEY);
    return stored ?? DEFAULT_TEMPLATE_ID;
  }

  async setDefaultTemplateId(id: string): Promise<void> {
    await this.appCache.setKV('global', CACHE_KEY, id);
  }
}
