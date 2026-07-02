/**
 * Append a Vendure AssetServer image preset to an asset URL, preserving any existing query string
 * (defensive — standard Vendure preview URLs are clean, but a CDN/proxy could add params).
 */
export function withImagePreset(
  url: string,
  preset: 'tiny' | 'thumb' | 'small' | 'medium' | 'large'
): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}preset=${preset}`;
}
