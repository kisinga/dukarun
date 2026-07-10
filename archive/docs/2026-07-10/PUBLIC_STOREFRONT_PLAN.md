# Public Storefront — Phase 1 Plan

## Goal
Put each approved merchant's catalogue on its own subdomain (`merchant.dukarun.com`)
so it can be **found (SEO)** and shared, with an "Order via WhatsApp" button.
Browse-only — no cart, no online checkout.

## Architecture at a glance
```
merchant.dukarun.com ──▶ storefront app  (nginx-static, same pattern as super-admin)
   browser loads shell ──▶ reads hostname → storefront(slug) → channel token
                                 ▼
                          backend /shop-api  (scoped to that channel by token)
                          backend /sitemap.xml, /robots.txt  (host-aware)
```
A single static app serves every subdomain. In the browser it reads the hostname to learn
which merchant it is, then talks to the existing Vendure shop-api scoped to that channel.

## Decisions (locked)
- **Per-merchant** storefronts, one subdomain each. Subdomains provisioned **manually** for now
  (wildcard DNS/TLS automation deferred).
- **Separate app** `@dukarun/storefront`, served **nginx-static** like `super-admin` (no Node runtime).
- **Client-side rendering** + dynamic meta. No SSR — deliberately trading preview/SEO fidelity for operational simplicity.
- Frontend uses **shop-api** (channel-scoped by `vendure-token`), never admin-api.
- Eligibility = `publicStorefrontEnabled` AND channel `status === APPROVED` AND active subscription.
- Lapsed subscription → show name + logo, hide catalogue, `noindex` (not a hard 404).
- Commerce = WhatsApp enquiry only.

## Accepted limitations of CSR (know what we're trading away)
- **Social link previews won't be product-specific.** WhatsApp/Facebook/X scrapers don't run JS, and
  all subdomains share one static shell, so a shared product link shows generic Dukarun preview text,
  not the product's name/image/price. This is the real cost given WhatsApp is the commerce channel.
- **No real HTTP 404s.** A static SPA answers every path with 200 + JS. We mitigate with `noindex` on
  not-found views and by keeping them out of the sitemap; Google tolerates this but it's imperfect.
- **Google-first SEO.** Google renders JS and will index client-set titles/meta/JSON-LD, but relies on
  its render budget. We keep first render fast and lean so it indexes cleanly.
- **Future upgrade path (deferred, not built now):** if sharing/SEO proves important, add a small
  meta-only prerender or edge step for product URLs — cheaper than full SSR. Explicitly out of scope this phase.

---

## 1. Backend

**Channel custom fields** (`backend/src/config/custom-fields/channel.custom-fields.ts`) + migration:
- `publicStorefrontEnabled` — boolean, default false (merchant opt-in; catalogue is public data, so it's a deliberate choice).
- `publicSlug` — string; validated as a DNS label (lowercase `a–z0–9-`, ≤63 chars, no leading/trailing hyphen, not a reserved name).
- `publicWhatsAppNumber` — string (E.164).

Uniqueness: app-level check on save **plus** a partial unique index on `publicSlug` in the migration
(`WHERE public_slug IS NOT NULL`). App check gives a clean error; the DB constraint prevents races.
(Accept the cosmetic "schema does not match" boot log per the custom-field-index note.)

**Public resolver** — small shop-api plugin, unauthenticated:
- `storefront(slug: String!): PublicStorefront` returning a **narrow DTO** (not the Channel entity):
  `{ channelToken, name, logoUrl, whatsappNumber, catalogueVisible }`.
- Looks up the channel by `publicSlug` directly (channel-agnostic — doesn't rely on the request token).
- Returns null unless `publicStorefrontEnabled && status === APPROVED`.
- `catalogueVisible = subscription active`. When lapsed: still return identity, `catalogueVisible: false`.
- `logoUrl` resolved to an absolute URL via the asset server prefix.
- `channelToken` is the standard public Vendure channel token — safe to expose (it's how storefronts select a channel).

**CORS** (`backend/src/vendure-config.ts`): allow any `*.dukarun.com` origin for **shop-api only**;
keep admin-api locked to the app host.

**Sitemap + robots** — host-aware backend routes (these still work fine without SSR):
- `/sitemap.xml` per host → that channel's product + collection URLs with `<lastmod>` from `updatedAt`.
- `/robots.txt` per host → `Disallow: /` when disabled/lapsed; otherwise allow + link the sitemap.

**Data hygiene / safety:**
- Storefront queries must not select `wholesalePrice` or `mlEmbedding`.
- Confirm stock is exposed as a **status** (in/low/out), not exact counts.
- Prices shown **tax-inclusive** (consumer-facing, KE VAT) — verify the tax display setting.

## 2. Storefront app (`@dukarun/storefront`)
- Scaffold from the `super-admin` skeleton (package.json, angular.json, tsconfig, Dockerfile, nginx.conf, docker-compose entry, root scripts).
- Codegen pointed at `/shop-api`; its own `operations.graphql.ts` (lean — only what the storefront needs).
- Apollo: copy `frontend`'s client, **strip admin bits** (login redirect, CompanyService); anonymous; injects `vendure-token`.
- `app.config` from `frontend`'s (icons + client hydration is harmless for CSR), minus auth/tracing.
- Copy over: `_design-system.scss`, `app-icons.ts`, `seo.service.ts`, product-card component.
- Keep the bundle lean — do **not** pull in ML/echarts/PWA deps.

## 3. Rendering (CSR)
- Served as static files by nginx — same container type as `super-admin`, no Node process.
- On load: generic shell paints (skeleton) → read `window.location.hostname` → derive slug →
  call `storefront(slug)` → set channel token + branding → fetch catalogue.
- Set title / meta / OG / JSON-LD **client-side per route** (Google picks these up after render).
- Store not found or disabled → simple "store not found" view. Lapsed → name + logo + message, no catalogue.
- All not-found / lapsed views: `noindex` and excluded from the sitemap.

## 4. Storefront behaviour
- Store home: name/logo, featured collections, product grid, search.
- Routes: `/` , `/products/:slug`, `/collections/:slug` (readable paths for SEO).
- Reuse product-card + `CurrencyService` (KES). Mobile-first (the audience is almost entirely mobile).
- **WhatsApp CTA** on product + detail: `wa.me/<publicWhatsAppNumber>?text=<name, variant, price, page URL>`.

## 5. SEO
- Per-page title / meta / OG / JSON-LD (`Product`, `Organization`, `BreadcrumbList`) set client-side.
- **Canonical = the merchant's own subdomain**, absolute.
- Host-aware sitemap + robots from the backend (section 1); submit sitemaps to Search Console.
- Fast, lean first render so Google's JS renderer indexes reliably.

## 6. Performance & mobile
- Responsive product images via AssetServer preset widths; lazy-load below the fold.
- Watch LCP on a mid-range phone / slow network. Keep JS minimal.

## 7. Testing (thin but present)
- Backend unit tests: slug validation; resolver gating (enabled / approved / active / lapsed).
- Storefront: unit test for WhatsApp link construction; one e2e smoke against a seeded subdomain
  (resolve → list → product → CTA).

## 8. Analytics
- Track the **WhatsApp CTA click** — it's the conversion event for this phase.

## 9. Deploy
- `storefront/Dockerfile` = nginx-static (clone `super-admin`'s); nginx proxies `/shop-api`,
  `/sitemap.xml`, `/robots.txt` to the backend; SPA fallback to the shell.
- Per merchant (manual): DNS record + Coolify host route → storefront container + cert;
  set channel `publicSlug` / `publicWhatsAppNumber`; flip `publicStorefrontEnabled`.
- Ensure `ASSET_URL_PREFIX` yields absolute image URLs (OG/JSON-LD need them).

## Reserved subdomains (reject as slugs)
`www, app, api, admin, super-admin, assets, static, cdn, mail, status, health, dev, staging`

---

## Build order — thin slice first, then widen
0. **Vertical slice:** one seeded merchant + one manually-set subdomain → resolve → list a few products → one product page → working WhatsApp button. Proves the whole path end-to-end before widening.
1. Backend: fields + migration + `storefront` resolver + CORS.
2. Scaffold `@dukarun/storefront` (nginx-static); Apollo/config/design in place.
3. Host → channel resolution + branding + lapsed state.
4. Catalogue: home → product → collection (search/facets).
5. SEO: meta + JSON-LD + sitemap + robots.
6. WhatsApp CTA + click analytics.
7. Wire deploy; take the pilot subdomain live end-to-end.

## Open items to confirm
- WhatsApp number format/source per merchant (E.164; who sets it).
- Featured content on the store home — merchant-picked collections, or just "all products"?

---

## Implementation status — 2026-07-02 (IMPLEMENTED)

Builds pass (backend `tsc`, super-admin + storefront `ng build`); backend runtime-tested against the
live shop-api. The **browser UI still needs a manual/e2e pass** (CSR can't be checked headlessly).

**Backend** (`backend/src/plugins/storefront/`)
- `storefront(slug)` and `publicStorefronts` shop-api queries; gating = `publicStorefrontEnabled && status===APPROVED && active subscription`. Lapsed → identity returned, `catalogueVisible:false`, noindex.
- Host-aware `/sitemap.xml` + `/robots.txt` controllers (paginated; noindex when disabled/lapsed).
- 3 Channel custom fields + migration `9920000000000` (columns only — slug uniqueness enforced in the operator mutation, NO DB index, so no "schema does not match" boot noise).
- Wildcard `*.{STOREFRONT_BASE_DOMAIN}` CORS for shop-api.

**Operator (super-admin)**: channel-detail → "Public storefront" card (slug / WhatsApp / publish toggle) → `updateChannelPublicStorefrontPlatform` (validates slug + E.164, refuses enable-without-slug, global slug uniqueness). This is where a channel opts in / gets its subdomain assigned.

**Storefront app** (`storefront/`, `@dukarun/storefront`, nginx-static, :4202): home (search + collections + grid), product (gallery + variants + WhatsApp CTA + JSON-LD), collection, and a **discovery directory**.

**Testing on localhost** (no real subdomains):
- Visit the storefront root → the **discovery directory** lists every public store; click one.
- Or force a specific store with `?store=<slug>` (e.g. `http://localhost:4202/?store=zero-q`).
- Pilot data is set on channel 2 (`zero-q`, enabled, WhatsApp `+254712345678`).
- Run: backend (`npm run dev` or `node backend/dist/src/index.js`), then `npm start -w @dukarun/storefront`.

**Security fix (from multi-lens review):** `mlEmbedding`, `mlEmbeddingVersion`, `wholesalePrice`
custom fields were `public: true` and leaked on the now-public shop-api — set to `public: false`
(admin-api still exposes them for the app). Verified closed (`Cannot query field`).

**Still manual (deferred):** per-merchant subdomain provisioning (DNS record + Coolify host route + cert). Reverse proxy must route `*.{STOREFRONT_BASE_DOMAIN}` to the storefront container.
