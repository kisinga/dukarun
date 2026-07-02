/**
 * Shared, dependency-free helpers for public storefront subdomain slugs.
 *
 * Kept out of any plugin so both the StorefrontPlugin (shop-api + sitemap) and the SuperAdminPlugin
 * (operator assignment mutation) can import it without cross-plugin coupling.
 */

/**
 * Subdomain labels that can never be used as a merchant storefront slug — reserved for platform
 * services so a merchant can't shadow, e.g., app.dukarun.com.
 */
export const RESERVED_STOREFRONT_SLUGS = [
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
];

/** Canonical form of a slug: trimmed and lowercased. */
export function normalizeStorefrontSlug(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * Validate a storefront slug as a DNS label. Returns a human-readable error message, or null when
 * the slug is valid. Normalizes before checking, so callers may pass raw input.
 */
export function validateStorefrontSlug(raw: string | null | undefined): string | null {
  const s = normalizeStorefrontSlug(raw);
  if (!s) return 'Subdomain slug is required.';
  if (s.length > 63) return 'Subdomain slug must be at most 63 characters.';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) {
    return 'Subdomain slug may contain only lowercase letters, digits and hyphens, and cannot start or end with a hyphen.';
  }
  if (RESERVED_STOREFRONT_SLUGS.includes(s)) {
    return `"${s}" is a reserved subdomain and cannot be used.`;
  }
  return null;
}

/**
 * Validate a WhatsApp number in E.164 form (e.g. +254712345678). Returns an error message, or null
 * when valid.
 */
export function validateWhatsAppNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return 'WhatsApp number is required.';
  if (!/^\+[1-9]\d{6,14}$/.test(s)) {
    return 'WhatsApp number must be in E.164 format, e.g. +254712345678.';
  }
  return null;
}
