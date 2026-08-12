#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = new URL(process.env.SITE_PUBLIC_URL || 'http://localhost:4202');
const routes = [
  '',
  'about',
  'contact',
  'docs',
  'docs/hardware',
  'blog',
  'privacy',
  'terms',
  'dpa',
  'subprocessors',
];
const urls = routes.map(route =>
  new URL(route, `${baseUrl.toString().replace(/\/+$/, '')}/`).toString()
);
const publicDir = resolve('public');
mkdirSync(publicDir, { recursive: true });

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n') +
  '\n</urlset>\n';
const root = new URL('/', baseUrl).toString().replace(/\/$/, '');
const robots = `User-agent: *\nAllow: /\nSitemap: ${root}/sitemap.xml\n`;

writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap);
writeFileSync(resolve(publicDir, 'robots.txt'), robots);
console.log(`[seo:site] wrote sitemap.xml and robots.txt for ${root}`);
