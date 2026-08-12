import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'apps/site/dist/site/browser');
const storefront = resolve(root, 'apps/storefront/dist/storefront/browser');
const web = resolve(root, 'apps/web/dist/web/browser');

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Missing expected build output: ${path}`);
  return readFileSync(path, 'utf8');
}

function requireMatchingSocialTitle(html, label) {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)">/)?.[1];
  const twitterTitle = html.match(/<meta name="twitter:title" content="([^"]+)">/)?.[1];
  if (!title || title !== ogTitle || title !== twitterTitle) {
    throw new Error(`${label} title, Open Graph title, and Twitter title must match.`);
  }
}

for (const route of ['', 'about', 'contact', 'docs', 'privacy', 'terms', 'dpa', 'subprocessors']) {
  const html = requireFile(resolve(site, route, 'index.html'));
  for (const marker of [
    '<html lang="en-KE"',
    '<title>',
    'name="description"',
    'name="robots" content="index, follow"',
    'rel="canonical"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'name="twitter:card"',
    'application/ld+json',
  ]) {
    if (!html.includes(marker)) throw new Error(`Site /${route} is missing ${marker}`);
  }
  requireMatchingSocialTitle(html, `Site /${route}`);
}

const siteIndex = requireFile(resolve(site, 'index.html'));
const siteSitemap = requireFile(resolve(site, 'sitemap.xml'));
const siteRobots = requireFile(resolve(site, 'robots.txt'));
const fixtureMode =
  process.env.PUBLIC_DATA_MODE === 'fixture' ||
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_ANON_KEY;
if (existsSync(resolve(site, 'blog/keep-stock-and-cash-in-step/index.html'))) {
  throw new Error('Blog articles must be crawler-rendered instead of prerendered at build time.');
}
const canonicalMatch = siteIndex.match(/<link rel="canonical" href="([^"]+)">/);
if (!canonicalMatch) throw new Error('Site root is missing its canonical URL.');
const siteOrigin = new URL(canonicalMatch[1]).origin;
if (
  (process.env.CI === 'true' || process.env.PUBLIC_DATA_MODE === 'live') &&
  !siteOrigin.startsWith('https://')
) {
  throw new Error(`Production site canonical must use HTTPS: ${siteOrigin}`);
}
for (const match of siteSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  if (new URL(match[1]).origin !== siteOrigin) {
    throw new Error(`Site sitemap origin differs from canonical origin: ${match[1]}`);
  }
}
if (!siteRobots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
  throw new Error('Site robots.txt sitemap origin differs from its canonical origin.');
}
if (!siteIndex.includes('"@type":"FAQPage"')) {
  throw new Error('Site root is missing FAQPage structured data.');
}

const privacy = requireFile(resolve(site, 'privacy/index.html'));
if (fixtureMode) {
  for (const marker of [
    'Version 2026-01-01',
    'This build fixture verifies that published legal content is rendered into static HTML.',
  ]) {
    if (!privacy.includes(marker))
      throw new Error(`Prerendered fixture legal HTML is missing: ${marker}`);
  }
} else if (!privacy.includes('site:legal:privacy') || !privacy.includes('content_markdown')) {
  throw new Error('Prerendered legal HTML is missing transferred document content.');
}
if (
  existsSync(resolve(site, 'ngsw.json')) ||
  existsSync(resolve(site, 'manifest.webmanifest')) ||
  existsSync(resolve(site, 'ngsw-worker.js'))
) {
  throw new Error('Public site must not install a PWA.');
}

const directory = requireFile(resolve(storefront, 'index.csr.html'));
const sitemap = requireFile(resolve(storefront, 'sitemap.xml'));
const storefrontRobots = requireFile(resolve(storefront, 'robots.txt'));
if (!directory.includes('<title>') || !sitemap.includes('<urlset')) {
  throw new Error('Storefront directory or sitemap is incomplete.');
}
for (const marker of ['<html lang="en-KE"', 'rel="icon"', 'noindex, nofollow']) {
  if (!directory.includes(marker)) throw new Error(`Storefront directory is missing ${marker}`);
}
const storefrontOrigin = new URL(process.env.STOREFRONT_PUBLIC_URL || 'http://localhost:4204')
  .origin;
if (!storefrontRobots.includes(`Sitemap: ${storefrontOrigin}/sitemap.xml`)) {
  throw new Error('Storefront robots.txt sitemap origin differs from its canonical origin.');
}
if (existsSync(resolve(storefront, 'statement')) || existsSync(resolve(storefront, 'document'))) {
  throw new Error('Private token routes must not be prerendered.');
}

requireFile(resolve(web, 'ngsw.json'));
requireFile(resolve(web, 'manifest.webmanifest'));

const siteCsr = requireFile(resolve(site, 'index.csr.html'));
requireFile(resolve(storefront, 'index.csr.html'));
if (!siteCsr.includes('name="robots" content="noindex, nofollow"')) {
  throw new Error('Marketing CSR fallback must remain noindex.');
}
const csrNginx = requireFile(resolve(root, 'apps/nginx.conf'));
const spaNginx = requireFile(resolve(root, 'apps/nginx-spa.conf'));
if (!csrNginx.includes('try_files $uri $uri/index.html /index.csr.html;')) {
  throw new Error('Static apps must fall back to index.csr.html.');
}
for (const marker of [
  'location ~ ^/(?:statement|document)/',
  'X-Robots-Tag "noindex, nofollow, noarchive"',
  'Referrer-Policy "no-referrer"',
  'public-content-renderer',
  'facebookexternalhit',
  'whatsapp',
  'googlebot',
  'location = /sitemap.xml',
  'X-Original-URI $request_uri',
]) {
  if (!csrNginx.includes(marker)) throw new Error(`Static nginx is missing ${marker}`);
}
if (!spaNginx.includes('try_files $uri $uri/ /index.html;')) {
  throw new Error('SPA apps must fall back to index.html.');
}
console.log('verify-prerender-output: clean.');
