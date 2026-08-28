export const DUKARUN_GUIDES_URL = 'https://dukarun.gitbook.io/docs';

export function dukarunGuideUrl(path = ''): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `${DUKARUN_GUIDES_URL}/${normalized}` : DUKARUN_GUIDES_URL;
}
