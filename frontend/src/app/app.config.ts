import { provideHttpClient } from '@angular/common/http';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { NetworkService } from './core/services/network.service';
import { TracingService } from './core/services/tracing.service';

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
    provideHttpClient(),
    provideRouter(routes),
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
