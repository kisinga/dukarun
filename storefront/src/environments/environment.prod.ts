// Prod: nginx in the container proxies /shop-api to the backend; app uses the relative URL only.
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
  production: true,
  apiUrl: getRuntimeConfig().apiUrl ?? '/shop-api',
};
