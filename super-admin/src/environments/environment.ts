// Runtime configuration can be injected via window.__APP_CONFIG__ (e.g. in Docker).
// For development, these defaults are used; dev server proxies /admin-api to backend (see proxy.conf.json).
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
  production: false,
  // Proxied by dev server to backend (proxy.conf.json); override via __APP_CONFIG__.apiUrl if needed
  apiUrl: runtimeConfig.apiUrl ?? '/admin-api',
};
