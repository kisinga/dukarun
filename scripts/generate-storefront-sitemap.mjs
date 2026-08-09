#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mode =
  process.env.PUBLIC_DATA_MODE === 'fixture' ||
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_ANON_KEY
    ? 'fixture'
    : 'live';
const baseUrl = (process.env.STOREFRONT_PUBLIC_URL || 'http://localhost:4204').replace(/\/+$/, '');
let slugs = ['fixture-shop'];

if (mode === 'live') {
  const endpoint = `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/public_storefronts?select=slug&slug=not.is.null`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Storefront sitemap query failed: ${response.status}`);
  const rows = await response.json();
  slugs = rows.map(row => row.slug).filter(Boolean);
}

const urls = ['', ...slugs.map(slug => `/${encodeURIComponent(slug)}`)];
const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(path => `  <url><loc>${baseUrl}${path}</loc></url>`).join('\n') +
  '\n</urlset>\n';
const target = resolve('public/sitemap.xml');
mkdirSync(resolve('public'), { recursive: true });
writeFileSync(target, xml);
console.log(`[sitemap:storefront] wrote ${target} (${urls.length} URLs)`);
