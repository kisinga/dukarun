#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = (process.env.STOREFRONT_PUBLIC_URL || 'http://localhost:4204').replace(/\/+$/, '');

const urls = [new URL('/', `${baseUrl}/`).toString()];
const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n') +
  '\n</urlset>\n';
const publicDir = resolve('public');
const target = resolve(publicDir, 'sitemap.xml');
const robotsTarget = resolve(publicDir, 'robots.txt');
mkdirSync(resolve('public'), { recursive: true });
writeFileSync(target, xml);
writeFileSync(robotsTarget, `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
console.log(`[sitemap:storefront] wrote sitemap.xml and robots.txt (${urls.length} URLs)`);
