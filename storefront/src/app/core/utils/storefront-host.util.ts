/**
 * Subdomain host helpers, shared by store resolution and the directory so the reserved-label list
 * and parsing rules live in one place. (Kept in sync with the backend
 * `RESERVED_STOREFRONT_SLUGS` in backend/src/utils/storefront-slug.util.ts.)
 */

export const RESERVED_SUBDOMAINS = [
  'www',
  'app',
  'api',
  'admin',
  'super-admin',
  'assets',
  'static',
  'cdn',
  'mail',
  'status',
  'health',
  'dev',
  'staging',
  // Platform discovery/default hosts — resolve to the directory, never a merchant.
  'store',
  'stores',
  'shop',
];

/** True for localhost / bare IP hosts, where there are no real merchant subdomains. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || /^[\d.]+$/.test(h);
}

/**
 * Merchant slug from a subdomain host, or null for localhost / apex / reserved labels.
 * e.g. `mama-mboga.dukarun.com` -> `mama-mboga`; `dukarun.com` / `www.dukarun.com` -> null.
 */
export function slugFromHost(host: string): string | null {
  const h = host.toLowerCase();
  if (isLocalHost(h)) return null;
  const parts = h.split('.');
  if (parts.length < 3) return null; // need <label>.<domain>.<tld>
  const label = parts[0];
  if (!label || RESERVED_SUBDOMAINS.includes(label)) return null;
  return label;
}

/**
 * Base domain for building `<slug>.<base>` links, stripping a leading reserved label so that,
 * e.g., visiting `www.dukarun.com` still links stores to `<slug>.dukarun.com` (not `.www.…`).
 */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().split('.');
  if (parts.length > 2 && RESERVED_SUBDOMAINS.includes(parts[0])) {
    return parts.slice(1).join('.');
  }
  return host.toLowerCase();
}
