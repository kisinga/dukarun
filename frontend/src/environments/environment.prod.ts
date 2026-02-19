// Runtime configuration injected via window.__APP_CONFIG__ in production
declare global {
  interface Window {
    __APP_CONFIG__?: {
      enableTracing?: boolean;
      signozEndpoint?: string;
      serviceName?: string;
      serviceVersion?: string;
      vapidPublicKey?: string;
      vendureAdminUrl?: string;
    };
  }
}

// Get runtime config from window (injected at container startup)
const getRuntimeConfig = () => {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }
  return {};
};

const runtimeConfig = getRuntimeConfig();

import { BRAND_CONFIG } from '../app/core/constants/brand.constants';

export const environment = {
  production: true,
  apiUrl: '/admin-api', // Will use same origin in production
  vendureAdminUrl: runtimeConfig.vendureAdminUrl ?? '/admin', // Backend Admin UI (same origin or override)
  // SigNoz Observability Configuration - injected at runtime via window.__APP_CONFIG__
  enableTracing: runtimeConfig.enableTracing ?? true,
  signozEndpoint: runtimeConfig.signozEndpoint ?? '/signoz/v1/traces',
  serviceName: runtimeConfig.serviceName ?? `${BRAND_CONFIG.servicePrefix}-frontend`,
  serviceVersion: runtimeConfig.serviceVersion ?? '2.0.0',
  vapidPublicKey: runtimeConfig.vapidPublicKey ?? '',
};
