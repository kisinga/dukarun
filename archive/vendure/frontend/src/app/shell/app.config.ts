import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';

import { routes } from './app.routes';
import { APP_ICONS } from '../shared/icons/app-icons';
import { NetworkService } from './services/network.service';
import { TracingService } from '../shared/services/tracing.service';
import { AuthService } from '@dukarun/auth';
import { CompanyService } from '@dukarun/company';
import { AppInitService } from './services/app-init.service';
import {
  APP_CACHE_RESET,
  COMPANY_CONTEXT,
  FINANCIAL_ACCESS,
} from '../shared/services/app-context.tokens';
import { LINK_PREVIEW_DATA_PROVIDER } from '../shared/services/link-preview/link-preview-data-provider.token';
import { LinkPreviewDataProviderService } from './services/link-preview-data-provider.service';

export function initializeNetworkStatus(networkService: NetworkService) {
  return () => {
    // Initialize network status service
    // Check initial status and setup listeners
    networkService.checkOnlineStatus();
    return Promise.resolve();
  };
}

export function initializeTracing(tracingService: TracingService) {
  return () => {
    // Initialize OpenTelemetry tracing service
    tracingService.initialize();
    return Promise.resolve();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    // Register the app's icon set once; default size 1rem (16px) matches the
    // dense UI, overridable per-icon via <ng-icon size="…">.
    provideNgIconsConfig({ size: '1rem' }),
    provideIcons(APP_ICONS),
    // Hydrate the prerendered public pages instead of re-rendering; withEventReplay
    // buffers clicks that land during hydration so nothing is lost.
    provideClientHydration(withEventReplay()),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    // Bridge tokens that let shared/domains code reach shell/app-wide services
    // without importing across layer boundaries. These services MUST stay
    // providedIn: 'root' so the injected tokens resolve to the same singleton.
    { provide: COMPANY_CONTEXT, useExisting: CompanyService },
    { provide: APP_CACHE_RESET, useExisting: AppInitService },
    { provide: FINANCIAL_ACCESS, useExisting: AuthService },
    { provide: LINK_PREVIEW_DATA_PROVIDER, useExisting: LinkPreviewDataProviderService },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(), // Only enable in production
      registrationStrategy: 'registerWhenStable:30000',
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeNetworkStatus,
      deps: [NetworkService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTracing,
      deps: [TracingService],
      multi: true,
    },
  ],
};
