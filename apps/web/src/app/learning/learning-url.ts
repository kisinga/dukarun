const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Removes tenant data and volatile route state before Usertour sees a URL. */
export function sanitizeLearningUrl(rawUrl: string, baseUrl?: string): string {
  const fallbackBase =
    baseUrl ?? (typeof window === 'undefined' ? 'https://app.dukarun.com' : window.location.origin);
  try {
    const url = new URL(rawUrl, fallbackBase);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname
      .split('/')
      .map(segment => (UUID_SEGMENT.test(segment) ? ':id' : segment))
      .join('/');
    return url.toString();
  } catch {
    return fallbackBase;
  }
}
