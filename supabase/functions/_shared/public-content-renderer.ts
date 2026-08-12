export type PublicApp = 'site' | 'storefront';

export interface PublicBlogPost {
  slug: string;
  title: string;
  excerpt: string;
  author_name: string;
  cover_image_path: string | null;
  cover_image_alt: string | null;
  seo_title: string;
  seo_description: string;
  published_at: string;
  updated_at?: string;
  reading_minutes: number;
  content_markdown?: string;
}

export interface PublicStorefront {
  name: string;
  slug: string | null;
  logo_path: string | null;
  catalogue_visible: boolean;
}

export interface PublicProductRow {
  product_id: string;
  product_name: string;
  image_path: string | null;
  manufacturer_name: string | null;
}

export interface SitemapBlogPost {
  slug: string;
  updated_at: string;
}

export type PublicContentRoute =
  | { kind: 'sitemap' }
  | { kind: 'blog-index' }
  | { kind: 'blog-article'; slug: string }
  | { kind: 'storefront-directory' }
  | { kind: 'shop'; slug: string }
  | { kind: 'product'; slug: string; productId: string };

const SITE_ROUTES = [
  '',
  'about',
  'contact',
  'docs',
  'blog',
  'privacy',
  'terms',
  'dpa',
  'subprocessors',
] as const;
const SOCIAL_IMAGE_PATH = '/media/video/product-overview/product-overview-full-wide.png';
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export function parsePublicContentRoute(
  app: PublicApp,
  requestUri: string
): PublicContentRoute | null {
  let pathname: string;
  try {
    pathname = new URL(requestUri, 'https://renderer.invalid').pathname;
  } catch {
    return null;
  }
  if (pathname === '/sitemap.xml') return { kind: 'sitemap' };
  if (app === 'site') {
    if (/^\/blog\/?$/.test(pathname)) return { kind: 'blog-index' };
    const article = new RegExp(`^/blog/(${SLUG})/?$`, 'i').exec(pathname);
    return article ? { kind: 'blog-article', slug: article[1].toLowerCase() } : null;
  }
  if (pathname === '/') return { kind: 'storefront-directory' };
  const product = new RegExp(`^/(${SLUG})/products/(${UUID})/?$`, 'i').exec(pathname);
  if (product) {
    return { kind: 'product', slug: product[1].toLowerCase(), productId: product[2].toLowerCase() };
  }
  const shop = new RegExp(`^/(${SLUG})/?$`, 'i').exec(pathname);
  return shop ? { kind: 'shop', slug: shop[1].toLowerCase() } : null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      const safe = /^(https?:\/\/|mailto:|#|\/)/i.test(href) ? href : '#';
      return `<a href="${safe}">${label}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/** Small escaped Markdown subset shared with the Angular public-content renderer. */
export function renderSafeMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;

  const closeParagraph = () => {
    if (paragraph.length) html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      closeParagraph();
      const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) {
        closeList();
        list = nextList;
        html.push(`<${list}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered ?? ordered)?.[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      closeParagraph();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(line);
  }
  closeParagraph();
  closeList();
  return html.join('\n');
}

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/+$/, '')}/`).toString();
}

export function storageObjectUrl(
  supabaseUrl: string,
  bucket: string,
  path: string | null
): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    try {
      return new URL(path).toString();
    } catch {
      return null;
    }
  }
  const encodedPath = path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

function jsonLd(value: object): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function page(options: {
  title: string;
  description: string;
  canonical: string;
  image: string;
  type: 'website' | 'article' | 'product';
  body: string;
  structuredData?: object;
  noindex?: boolean;
}): string {
  const {
    title,
    description,
    canonical,
    image,
    type,
    body,
    structuredData,
    noindex = false,
  } = options;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = escapeHtml(image);
  return `<!doctype html>
<html lang="en-KE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}">
  <link rel="canonical" href="${safeCanonical}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="en_KE">
  <meta property="og:image" content="${safeImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">
  ${structuredData ? `<script type="application/ld+json">${jsonLd(structuredData)}</script>` : ''}
  <style>body{font:16px/1.65 system-ui,sans-serif;max-width:48rem;margin:auto;padding:2rem;color:#202020}img{display:block;max-width:100%;height:auto}a{color:#b8401f}h1{line-height:1.15}header,article{margin-block:2rem}.meta{color:#666}</style>
</head>
<body>${body}</body>
</html>`;
}

export function renderNotFound(origin: string): string {
  const canonical = absoluteUrl(origin, '/');
  return page({
    title: 'Page not found | Dukarun',
    description: 'This public page is not available.',
    canonical,
    image: absoluteUrl(origin, SOCIAL_IMAGE_PATH),
    type: 'website',
    noindex: true,
    body: `<main><h1>Page not found</h1><p><a href="${escapeHtml(canonical)}">Visit Dukarun</a></p></main>`,
  });
}

export function renderBlogIndex(posts: PublicBlogPost[], origin: string): string {
  const canonical = absoluteUrl(origin, '/blog');
  const image = absoluteUrl(origin, SOCIAL_IMAGE_PATH);
  const items = posts
    .map(post => {
      const url = absoluteUrl(origin, `/blog/${encodeURIComponent(post.slug)}`);
      return `<article><h2><a href="${escapeHtml(url)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p><p class="meta">${escapeHtml(post.author_name)} · ${post.reading_minutes} min read</p></article>`;
    })
    .join('\n');
  return page({
    title: 'Business guides | Dukarun',
    description: 'Practical guides for running sales, stock, cash flow, and books.',
    canonical,
    image,
    type: 'website',
    body: `<main><header><h1>Business guides</h1><p>Practical guides for running a better business.</p></header>${items || '<p>No articles are published yet.</p>'}</main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Dukarun business guides',
      url: canonical,
    },
  });
}

export function renderBlogArticle(post: PublicBlogPost, origin: string, image: string): string {
  const canonical = absoluteUrl(origin, `/blog/${encodeURIComponent(post.slug)}`);
  const titleBase = post.seo_title || post.title;
  const title = /\|\s*dukarun$/i.test(titleBase) ? titleBase : `${titleBase} | Dukarun`;
  const description = post.seo_description || post.excerpt;
  const cover = post.cover_image_path
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.cover_image_alt || post.title)}">`
    : '';
  return page({
    title,
    description,
    canonical,
    image,
    type: 'article',
    body: `<main><p><a href="${escapeHtml(absoluteUrl(origin, '/blog'))}">Dukarun business guides</a></p><article><header><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.excerpt)}</p><p class="meta">${escapeHtml(post.author_name)} · <time datetime="${escapeHtml(post.published_at)}">${escapeHtml(post.published_at.slice(0, 10))}</time> · ${post.reading_minutes} min read</p>${cover}</header>${renderSafeMarkdown(post.content_markdown ?? '')}</article></main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description,
      image: [image],
      datePublished: post.published_at,
      dateModified: post.updated_at ?? post.published_at,
      author: { '@type': 'Person', name: post.author_name },
      mainEntityOfPage: canonical,
    },
  });
}

export function renderProduct(
  shop: PublicStorefront,
  product: PublicProductRow,
  origin: string,
  image: string
): string {
  const canonical = absoluteUrl(
    origin,
    `/${encodeURIComponent(shop.slug ?? '')}/products/${encodeURIComponent(product.product_id)}`
  );
  const title = `${product.product_name} · ${shop.name}`;
  const description = `View ${product.product_name} at ${shop.name} and order on WhatsApp.`;
  const manufacturer = product.manufacturer_name
    ? `<p>By ${escapeHtml(product.manufacturer_name)}</p>`
    : '';
  return page({
    title,
    description,
    canonical,
    image,
    type: 'product',
    body: `<main><article><img src="${escapeHtml(image)}" alt="${escapeHtml(product.product_name)}"><h1>${escapeHtml(product.product_name)}</h1>${manufacturer}<p>Available from ${escapeHtml(shop.name)}.</p><p><a href="${escapeHtml(canonical)}">View product</a></p></article></main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.product_name,
      image: [image],
      brand: product.manufacturer_name
        ? { '@type': 'Brand', name: product.manufacturer_name }
        : undefined,
      url: canonical,
    },
  });
}

export function renderStorefrontDirectory(shops: PublicStorefront[], origin: string): string {
  const canonical = absoluteUrl(origin, '/');
  const image = absoluteUrl('https://dukarun.com', SOCIAL_IMAGE_PATH);
  const items = shops
    .filter(shop => shop.slug)
    .map(shop => {
      const url = absoluteUrl(origin, `/${encodeURIComponent(shop.slug ?? '')}`);
      return `<li><a href="${escapeHtml(url)}">${escapeHtml(shop.name)}</a></li>`;
    })
    .join('\n');
  return page({
    title: 'Dukarun shops',
    description: 'Browse public Dukarun shops and order on WhatsApp.',
    canonical,
    image,
    type: 'website',
    body: `<main><h1>Dukarun shops</h1><ul>${items}</ul></main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Dukarun shops',
      url: canonical,
    },
  });
}

export function renderShop(
  shop: PublicStorefront,
  products: PublicProductRow[],
  origin: string,
  image: string
): string {
  const canonical = absoluteUrl(origin, `/${encodeURIComponent(shop.slug ?? '')}`);
  const productLinks = [...new Map(products.map(product => [product.product_id, product])).values()]
    .map(product => {
      const url = absoluteUrl(
        origin,
        `/${encodeURIComponent(shop.slug ?? '')}/products/${encodeURIComponent(product.product_id)}`
      );
      return `<li><a href="${escapeHtml(url)}">${escapeHtml(product.product_name)}</a></li>`;
    })
    .join('\n');
  return page({
    title: `${shop.name} | Dukarun shops`,
    description: `Browse ${shop.name} and order directly on WhatsApp.`,
    canonical,
    image,
    type: 'website',
    noindex: !shop.catalogue_visible,
    body: `<main><h1>${escapeHtml(shop.name)}</h1>${shop.catalogue_visible ? `<p>Browse products available from this shop.</p><ul>${productLinks}</ul>` : '<p>This catalogue is not currently public.</p>'}</main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: shop.name,
      url: canonical,
      image,
    },
  });
}

export function renderSiteSitemap(origin: string, posts: SitemapBlogPost[]): string {
  const staticUrls = SITE_ROUTES.map(path => ({ url: absoluteUrl(origin, `/${path}`) }));
  const blogUrls = posts.map(post => ({
    url: absoluteUrl(origin, `/blog/${encodeURIComponent(post.slug)}`),
    lastmod: post.updated_at,
  }));
  return renderSitemap([...staticUrls, ...blogUrls]);
}

export function renderStorefrontSitemap(
  origin: string,
  entries: Array<{ slug: string; product_id: string | null; updated_at?: string }>
): string {
  const slugs = [...new Set(entries.map(entry => entry.slug))];
  return renderSitemap([
    { url: absoluteUrl(origin, '/') },
    ...slugs.map(slug => ({ url: absoluteUrl(origin, `/${encodeURIComponent(slug)}`) })),
    ...entries
      .filter(entry => entry.product_id)
      .map(entry => ({
        url: absoluteUrl(
          origin,
          `/${encodeURIComponent(entry.slug)}/products/${encodeURIComponent(entry.product_id ?? '')}`
        ),
        lastmod: entry.updated_at,
      })),
  ]);
}

function renderSitemap(entries: Array<{ url: string; lastmod?: string }>): string {
  const urls = entries
    .map(
      entry =>
        `  <url><loc>${escapeXml(entry.url)}</loc>${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
