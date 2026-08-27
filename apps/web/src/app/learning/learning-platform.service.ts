import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import usertour from 'usertour.js';
import { environment } from '../../environments/environment';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService, type AppIdentity } from '../core/supabase.service';
import {
  LEARNING_CONTENT_REGISTRY,
  type LearningContentKey,
  type LearningEventName,
} from './learning-content';
import { sanitizeLearningUrl } from './learning-url';

export interface LearningLaunchContext {
  key: LearningContentKey;
  startedAt: number;
}

export type LearningLaunchResult =
  | 'started'
  | 'vendor-disabled'
  | 'content-unconfigured'
  | 'permission-denied'
  | 'navigation-failed';

@Injectable({ providedIn: 'root' })
export class LearningPlatformService {
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly permissions = inject(PermissionsService);

  /** Short-lived hand-off state only; Usertour owns durable flow/checklist progress. */
  readonly launchContext = signal<LearningLaunchContext | null>(null);

  private sdkInitialized = false;
  private identifiedScope: string | null = null;
  private identification: Promise<boolean> | null = null;
  private identityGeneration = 0;

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const permissionsReady = this.permissions.ready();
      if (!identity) {
        this.reset();
        return;
      }
      if (permissionsReady && environment.usertourToken.trim()) void this.identify(identity);
    });
  }

  async initialize(): Promise<boolean> {
    if (!environment.usertourToken.trim()) return false;
    this.configureSdk();
    await this.permissions.ensureLoaded();
    const identity = this.supabase.offlineIdentity();
    return identity ? this.identify(identity) : false;
  }

  canLaunch(key: LearningContentKey): boolean {
    return LEARNING_CONTENT_REGISTRY[key].permissions.every(permission =>
      this.permissions.has(permission)
    );
  }

  async launch(
    key: LearningContentKey,
    options: { continue?: boolean } = {}
  ): Promise<LearningLaunchResult> {
    const definition = LEARNING_CONTENT_REGISTRY[key];
    await this.permissions.ensureLoaded();
    if (!this.canLaunch(key)) return 'permission-denied';

    this.launchContext.set({ key, startedAt: Date.now() });
    const navigated = await this.router.navigateByUrl(definition.destinationRoute);
    if (!navigated) {
      this.launchContext.set(null);
      return 'navigation-failed';
    }

    if (!environment.usertourToken.trim()) {
      this.launchContext.set(null);
      return 'vendor-disabled';
    }
    if (!definition.usertourContentId) {
      this.launchContext.set(null);
      return 'content-unconfigured';
    }

    try {
      if (!(await this.initialize())) return 'vendor-disabled';
      await usertour.start(definition.usertourContentId, {
        continue: options.continue ?? definition.type === 'journey',
      });
      return 'started';
    } catch (error) {
      console.warn('Learning guide could not start', error);
      return 'vendor-disabled';
    } finally {
      this.launchContext.set(null);
    }
  }

  async track(eventName: LearningEventName): Promise<void> {
    if (!environment.usertourToken.trim()) return;
    try {
      if (!(await this.initialize())) return;
      await usertour.track(eventName);
    } catch (error) {
      // Learning telemetry must never make a successful business operation fail.
      console.warn('Learning event could not be sent', error);
    }
  }

  reset(): void {
    this.identityGeneration++;
    this.identifiedScope = null;
    this.identification = null;
    this.launchContext.set(null);
    if (this.sdkInitialized) usertour.reset();
  }

  private configureSdk(): void {
    if (this.sdkInitialized) return;
    usertour.init(environment.usertourToken.trim());
    usertour.disableEvalJs();
    usertour.setBaseZIndex(70);
    usertour.setUrlFilter(url => sanitizeLearningUrl(url));
    usertour.setCustomNavigate(url => this.navigateFromGuide(url));
    this.sdkInitialized = true;
  }

  private identify(identity: AppIdentity): Promise<boolean> {
    const scope = `${identity.userId}:${identity.companyId}`;
    if (this.identifiedScope === scope) return Promise.resolve(true);
    if (this.identification) {
      return this.identification.then(() =>
        this.identifiedScope === scope ? true : this.identify(identity)
      );
    }
    this.configureSdk();
    if (this.identifiedScope && this.identifiedScope !== scope) {
      this.identityGeneration++;
      this.identifiedScope = null;
      usertour.reset();
    }
    const generation = this.identityGeneration;

    let request: Promise<boolean>;
    request = this.signedIdentity(identity)
      .then(async token => {
        if (!token) return false;
        const current = this.supabase.offlineIdentity();
        if (
          generation !== this.identityGeneration ||
          current?.userId !== identity.userId ||
          current.companyId !== identity.companyId
        ) {
          return false;
        }
        await usertour.identify(identity.userId, {}, { token });
        await usertour.group(
          identity.companyId,
          {},
          {
            token,
            membership: {
              can_manage_catalog: this.permissions.has('ManageCatalog'),
              can_manage_stock: this.permissions.has('ManageStockAdjustments'),
              can_manage_supplier_credit: this.permissions.has('ManageSupplierCreditPurchases'),
              can_settle_orders: this.permissions.has('SettleOrder'),
              can_manage_customers: this.permissions.has('ManageCustomers'),
              can_manage_customer_credit: this.permissions.has('ManageCustomerCreditLimit'),
              can_view_financials: this.permissions.has('ViewFinancials'),
            },
          }
        );
        this.identifiedScope = scope;
        return true;
      })
      .catch(error => {
        console.warn('Learning identity could not be initialized', error);
        return false;
      })
      .finally(() => {
        if (this.identification === request) this.identification = null;
      });
    this.identification = request;
    return request;
  }

  private async signedIdentity(identity: AppIdentity): Promise<string | null> {
    const { data, error } = await this.supabase.client.functions.invoke('usertour-identity');
    if (error) throw error;
    const response = data as { token?: unknown; companyId?: unknown } | null;
    if (typeof response?.token !== 'string' || response.companyId !== identity.companyId) {
      return null;
    }
    return response.token;
  }

  private navigateFromGuide(rawUrl: string): void {
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (url.origin === window.location.origin) {
        void this.router.navigateByUrl(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      // Ignore malformed vendor-authored destinations.
    }
  }
}
