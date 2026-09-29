import { Injectable, computed, inject } from '@angular/core';
import { CompanySettingsStore } from './company-settings.store';
import { nextShopSetupStep, shopSetupTasks } from './shop-setup-state';

/** Only derives readiness. Company-scoped saved presentation state lives in Settings. */
@Injectable({ providedIn: 'root' })
export class ShopSetupCoordinator {
  readonly store = inject(CompanySettingsStore);
  readonly tasks = computed(() => {
    const s = this.store.settings();
    return s ? shopSetupTasks(s) : [];
  });
  readonly nextStep = computed(() => {
    const s = this.store.settings();
    return s ? nextShopSetupStep(s) : 0;
  });
  readonly ready = computed(() => this.store.settings() !== null && this.nextStep() === 3);
  readonly autoOffer = computed(() => {
    const s = this.store.settings()?.shop_setup;
    return !!s?.auto_offer && !s.offered && !this.ready();
  });
  async offered(deferred = false): Promise<void> {
    await this.store.saveSetup({ offered: true, deferred });
  }
}
