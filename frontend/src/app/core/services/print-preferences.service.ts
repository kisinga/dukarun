import { Injectable } from '@angular/core';

const STORAGE_KEY = 'dukahub-print-template';
const DEFAULT_TEMPLATE_ID = 'receipt-52mm';

@Injectable({
  providedIn: 'root',
})
export class PrintPreferencesService {
  getDefaultTemplateId(): string {
    if (typeof localStorage === 'undefined') return DEFAULT_TEMPLATE_ID;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ?? DEFAULT_TEMPLATE_ID;
  }

  setDefaultTemplateId(id: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, id);
  }
}
