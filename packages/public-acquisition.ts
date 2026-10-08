/** Typed acquisition links. No visitor answers belong in these URLs. */
export type EnquiryIntent = 'demo' | 'setup';
export type AcquisitionAction = EnquiryIntent | 'registration' | 'cash-up';

export interface AcquisitionSource {
  from: string;
  blogRef?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/i;
const cleanCampaign = (value: string | null): string | undefined =>
  value
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100) || undefined;

export function enquiryIntent(value: string | null): EnquiryIntent {
  return value === 'setup' ? 'setup' : 'demo';
}

export function acquisitionSource(
  params: URLSearchParams,
  fallback = '/contact'
): AcquisitionSource {
  const from = params.get('from');
  const ref = params.get('blog_ref');
  return {
    from: from && from.length <= 160 && PATH.test(from) ? from : fallback,
    ...(ref && UUID.test(ref) ? { blogRef: ref } : {}),
    ...(cleanCampaign(params.get('utm_source'))
      ? { utmSource: cleanCampaign(params.get('utm_source')) }
      : {}),
    ...(cleanCampaign(params.get('utm_medium'))
      ? { utmMedium: cleanCampaign(params.get('utm_medium')) }
      : {}),
    ...(cleanCampaign(params.get('utm_campaign'))
      ? { utmCampaign: cleanCampaign(params.get('utm_campaign')) }
      : {}),
  };
}

/** Only attribution fields are forwarded between acquisition steps. */
export function acquisitionParams(source: AcquisitionSource): URLSearchParams {
  const params = new URLSearchParams({ from: source.from });
  if (source.blogRef && UUID.test(source.blogRef)) params.set('blog_ref', source.blogRef);
  if (source.utmSource) params.set('utm_source', source.utmSource);
  if (source.utmMedium) params.set('utm_medium', source.utmMedium);
  if (source.utmCampaign) params.set('utm_campaign', source.utmCampaign);
  return params;
}

export function enquiryPath(intent: EnquiryIntent, source: AcquisitionSource): string {
  const params = new URLSearchParams({ intent, ...Object.fromEntries(acquisitionParams(source)) });
  return `/contact?${params}`;
}

export function classifyAcquisitionLink(
  href: string,
  siteOrigin: string,
  appOrigin: string
): AcquisitionAction | null {
  let url: URL;
  try {
    url = new URL(href, siteOrigin);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const site = new URL(siteOrigin).origin;
  const app = new URL(appOrigin).origin;
  if ((url.origin === app || url.origin === site) && /^\/register\/?$/.test(url.pathname))
    return 'registration';
  if (url.origin !== site) return null;
  if (/^\/contact\/?$/.test(url.pathname)) return enquiryIntent(url.searchParams.get('intent'));
  if (/^\/tools\/daily-shop-cash-up\/?$/.test(url.pathname)) return 'cash-up';
  return null;
}
