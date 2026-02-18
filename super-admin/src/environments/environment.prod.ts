declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

const apiUrl =
  typeof window !== 'undefined' && window.__APP_CONFIG__?.apiUrl
    ? window.__APP_CONFIG__.apiUrl
    : '/admin-api';

export const environment = {
  production: true,
  apiUrl,
};
