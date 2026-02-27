// Runtime configuration injected via window.__APP_CONFIG__ in production (e.g. Docker entrypoint).
// When not set, defaults to same-origin /admin-api (backend served behind same host or reverse proxy).
declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

const getRuntimeConfig = () => {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }
  return {};
};

const runtimeConfig = getRuntimeConfig();

export const environment = {
  production: true,
  // Injected at container startup when API is on a different origin; else same-origin
  apiUrl: runtimeConfig.apiUrl ?? '/admin-api',
};
