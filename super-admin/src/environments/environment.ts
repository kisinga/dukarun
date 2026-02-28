// Dev: dev server proxies /admin-api to backend (proxy.conf.json). Same pattern as frontend.
declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

const getRuntimeConfig = () => {
  if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }
  return {};
};

export const environment = {
  production: false,
  apiUrl: getRuntimeConfig().apiUrl ?? '/admin-api',
};
