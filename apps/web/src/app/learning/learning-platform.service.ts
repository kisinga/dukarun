import { Injectable, InjectionToken, effect, inject, signal } from '@angular/core';
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

// DaisyUI dialogs use z-index 999. Keep learning prompts above dialogs so a flow can
// continue inside decomposed editors instead of disappearing behind their modal layer.
const LEARNING_OVERLAY_BASE_Z_INDEX = 1_000_000;
const IDENTITY_FUNCTION_TIMEOUT_MS = 4_000;
const USERTOUR_OPERATION_TIMEOUT_MS = 5_000;
const USERTOUR_START_TIMEOUT_MS = 4_000;
const USERTOUR_TARGET_MISSING_SECONDS = 2;
const CANONICAL_DUKARUN_APP_ORIGIN = 'https://app.dukarun.com';

export const USERTOUR_CLIENT = new InjectionToken<typeof usertour>('Usertour client', {
  factory: () => usertour,
});

export interface LearningLaunchFailure {
  key: LearningContentKey;
  result: Extract<LearningLaunchResult, 'vendor-disabled'>;
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
  private readonly usertour = inject(USERTOUR_CLIENT);

  readonly launchFailure = signal<LearningLaunchFailure | null>(null);

  private sdkInitialized = false;
  private identifiedScope: string | null = null;
  private identification: Promise<boolean> | null = null;
  private identityGeneration = 0;
  private groupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // usertour.js is an async loader. Initializing immediately starts fetching the real SDK while
    // the user is doing ordinary work, instead of putting that download on the first guide click.
    if (environment.usertourToken.trim()) this.configureSdk();
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

    if (!environment.usertourToken.trim()) return 'vendor-disabled';
    if (!definition.usertourContentId) return 'content-unconfigured';

    this.launchFailure.set(null);
    // Identity warms in parallel with routing. Once the destination is open, hand the content ID
    // to Usertour and return immediately. Vendor latency must never become application latency.
    const initializationStartedAt = Date.now();
    const initialization = this.initialize();
    const navigateStartedAt = Date.now();
    const navigated = await this.router.navigateByUrl(definition.destinationRoute);
    markLearningPhase(`launch ${key} navigate`, navigateStartedAt);
    if (!navigated) return 'navigation-failed';
    void this.startContent(key, definition.usertourContentId, initialization, {
      continue: options.continue ?? definition.type === 'journey',
      startedAt: initializationStartedAt,
    });
    return 'started';
  }

  async track(eventName: LearningEventName): Promise<void> {
    if (!environment.usertourToken.trim()) return;
    try {
      if (!(await this.initialize())) return;
      await withTimeout(
        this.usertour.track(eventName),
        USERTOUR_OPERATION_TIMEOUT_MS,
        'Usertour event tracking timed out'
      );
    } catch (error) {
      // Learning telemetry must never make a successful business operation fail.
      console.warn('Learning event could not be sent', error);
    }
  }

  reset(): void {
    this.identityGeneration++;
    this.identifiedScope = null;
    this.identification = null;
    this.clearGroupTimer();
    this.launchFailure.set(null);
    if (this.sdkInitialized) this.usertour.reset();
  }

  dismissLaunchFailure(): void {
    this.launchFailure.set(null);
  }

  private configureSdk(): void {
    if (this.sdkInitialized) return;
    this.usertour.init(environment.usertourToken.trim());
    this.usertour.disableEvalJs();
    this.usertour.setBaseZIndex(LEARNING_OVERLAY_BASE_Z_INDEX);
    this.usertour.setTargetMissingSeconds(USERTOUR_TARGET_MISSING_SECONDS);
    this.usertour.setUrlFilter(url => sanitizeLearningUrl(url));
    this.usertour.setCustomNavigate(url => this.navigateFromGuide(url));
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
      this.usertour.reset();
    }
    const generation = this.identityGeneration;

    let request: Promise<boolean>;
    const signedStartedAt = Date.now();
    request = this.signedIdentity(identity)
      .then(async token => {
        markLearningPhase('signed-identity', signedStartedAt);
        if (!token) return false;
        const current = this.supabase.offlineIdentity();
        if (
          generation !== this.identityGeneration ||
          current?.userId !== identity.userId ||
          current.companyId !== identity.companyId
        ) {
          return false;
        }
        const sdkIdentifyStartedAt = Date.now();
        await withTimeout(
          this.usertour.identify(identity.userId, {}, { token }),
          USERTOUR_OPERATION_TIMEOUT_MS,
          'Usertour user identification timed out'
        );
        markLearningPhase('sdk-identify', sdkIdentifyStartedAt);
        this.identifiedScope = scope;
        // Company metadata is not required to render explicitly launched content. Queue it after
        // identify so start() is never held behind another third-party round trip.
        this.scheduleCompanyIdentification(identity, token, generation);
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
    const { data, error } = await this.supabase.client.functions.invoke('usertour-identity', {
      timeout: IDENTITY_FUNCTION_TIMEOUT_MS,
    });
    if (error) throw error;
    const response = data as { token?: unknown; companyId?: unknown } | null;
    if (typeof response?.token !== 'string' || response.companyId !== identity.companyId) {
      return null;
    }
    return response.token;
  }

  private navigateFromGuide(rawUrl: string): void {
    if (learningTimingEnabled()) {
      console.info(`[learning] vendor requested navigation: ${rawUrl}`);
    }
    try {
      const url = new URL(rawUrl, window.location.origin);
      const configuredAppOrigin = new URL(environment.appPublicUrl, window.location.origin).origin;
      if (
        url.origin === window.location.origin ||
        url.origin === configuredAppOrigin ||
        url.origin === CANONICAL_DUKARUN_APP_ORIGIN
      ) {
        void this.router.navigateByUrl(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      // Ignore malformed vendor-authored destinations.
    }
  }

  private async startContent(
    key: LearningContentKey,
    contentId: string,
    initialization: Promise<boolean>,
    options: { continue: boolean; startedAt?: number }
  ): Promise<void> {
    try {
      if (!(await initialization)) throw new Error('Usertour identity is unavailable');
      markLearningPhase(`launch ${key} initialize`, options.startedAt ?? Date.now());
      const startRequestedAt = Date.now();
      await withTimeout(
        this.usertour.start(contentId, { continue: options.continue }),
        USERTOUR_START_TIMEOUT_MS,
        'Usertour guide start timed out'
      );
      markLearningPhase(`launch ${key} start`, startRequestedAt);
    } catch (error) {
      console.warn('Learning guide could not start', error);
      this.launchFailure.set({ key, result: 'vendor-disabled' });
    }
  }

  private scheduleCompanyIdentification(
    identity: AppIdentity,
    token: string,
    generation: number
  ): void {
    this.clearGroupTimer();
    this.groupTimer = setTimeout(() => {
      this.groupTimer = null;
      const current = this.supabase.offlineIdentity();
      if (
        generation !== this.identityGeneration ||
        current?.userId !== identity.userId ||
        current.companyId !== identity.companyId
      ) {
        return;
      }
      void withTimeout(
        this.usertour.group(
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
        ),
        USERTOUR_OPERATION_TIMEOUT_MS,
        'Usertour company identification timed out'
      ).catch(error => console.warn('Learning company identity could not be initialized', error));
    }, 0);
  }

  private clearGroupTimer(): void {
    if (this.groupTimer) clearTimeout(this.groupTimer);
    this.groupTimer = null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Console timings for diagnosing how long each vendor round trip adds to a guide launch.
// On by default; silence with: localStorage.setItem('dukarun:learning-timing', '0')
const LEARNING_TIMING_STORAGE_KEY = 'dukarun:learning-timing';

function learningTimingEnabled(): boolean {
  try {
    return (
      typeof localStorage === 'undefined' ||
      localStorage.getItem(LEARNING_TIMING_STORAGE_KEY) !== '0'
    );
  } catch {
    return true;
  }
}

function markLearningPhase(phase: string, startedAt: number): void {
  if (learningTimingEnabled()) {
    console.info(`[learning] ${phase}: ${Date.now() - startedAt}ms`);
  }
}
