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

for (const route of ['', 'about', 'contact', 'docs', 'privacy', 'terms', 'dpa', 'subprocessors']) {
  const html = requireFile(resolve(site, route, 'index.html'));
  for (const marker of ['<title>', 'name="description"', 'rel="canonical"']) {
    if (!html.includes(marker)) throw new Error(`Site /${route} is missing ${marker}`);
  }
}

const siteIndex = requireFile(resolve(site, 'index.html'));
const siteSitemap = requireFile(resolve(site, 'sitemap.xml'));
const siteRobots = requireFile(resolve(site, 'robots.txt'));
const canonicalMatch = siteIndex.match(/<link rel="canonical" href="([^"]+)">/);
if (!canonicalMatch) throw new Error('Site root is missing its canonical URL.');
const siteOrigin = new URL(canonicalMatch[1]).origin;
for (const match of siteSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  if (new URL(match[1]).origin !== siteOrigin) {
    throw new Error(`Site sitemap origin differs from canonical origin: ${match[1]}`);
  }
}
if (!siteRobots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
  throw new Error('Site robots.txt sitemap origin differs from its canonical origin.');
}

const privacy = requireFile(resolve(site, 'privacy/index.html'));
const fixtureMode =
  process.env.PUBLIC_DATA_MODE === 'fixture' ||
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_ANON_KEY;
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

const directory = requireFile(resolve(storefront, 'index.html'));
const sitemap = requireFile(resolve(storefront, 'sitemap.xml'));
if (!directory.includes('<title>') || !sitemap.includes('<urlset')) {
  throw new Error('Storefront directory or sitemap is incomplete.');
}
if (existsSync(resolve(storefront, 'statement')) || existsSync(resolve(storefront, 'document'))) {
  throw new Error('Private token routes must not be prerendered.');
}

const shopPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(match => new URL(match[1]).pathname.replace(/^\/+|\/+$/g, ''))
  .filter(Boolean);
for (const slug of shopPaths) {
  const html = requireFile(resolve(storefront, slug, 'index.html'));
  for (const marker of ['<title>', 'rel="canonical"', 'application/ld+json']) {
    if (!html.includes(marker)) throw new Error(`Storefront /${slug} is missing ${marker}`);
  }
  for (const forbidden of [
    'customer_first_name',
    'outstanding_total',
    'document_number',
    'live stock',
  ]) {
    if (html.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`Storefront /${slug} contains private or live data marker: ${forbidden}`);
    }
  }
  if (html.includes('Nothing listed yet')) {
    throw new Error(`Storefront /${slug} claims an empty catalog before browser loading.`);
  }
}

requireFile(resolve(web, 'ngsw.json'));
requireFile(resolve(web, 'manifest.webmanifest'));

for (const app of [site, storefront]) requireFile(resolve(app, 'index.csr.html'));
const csrNginx = requireFile(resolve(root, 'apps/nginx.conf'));
const spaNginx = requireFile(resolve(root, 'apps/nginx-spa.conf'));
if (!csrNginx.includes('try_files $uri $uri/index.html /index.csr.html;')) {
  throw new Error('Static apps must fall back to index.csr.html.');
}
if (!spaNginx.includes('try_files $uri $uri/ /index.html;')) {
  throw new Error('SPA apps must fall back to index.html.');
}
console.log('verify-prerender-output: clean.');
