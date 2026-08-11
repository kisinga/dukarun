# Storefront design language

## North star

The storefront should feel like a trusted neighbourhood shop presented with the care of a
modern catalogue. The merchant is the brand; Dukarun is quiet infrastructure. Browsing must be
fast on a small phone, prices must be unmistakable, and every page should make the next action
obvious without behaving like a full ecommerce checkout.

## Principles

1. **Merchant first.** Lead with the shop's name and mark. Dukarun attribution stays secondary.
2. **Catalogue, not dashboard.** Use generous product imagery, plain language, and progressive
   disclosure. Operational data and exact inventory counts never appear publicly.
3. **Warm and useful.** Warm paper surfaces and terracotta accents make the experience distinctive;
   charcoal type keeps it legible. Decoration never competes with products.
4. **One clear action.** Product discovery leads to a detail page, and the detail page leads to a
   pre-filled WhatsApp enquiry. Avoid competing primary buttons.
5. **Small-screen native.** Two-column product grids, 44px minimum targets, horizontal category
   rails, and sticky mobile actions are the default. Larger layouts expand rather than redesign.

## Foundations

- **Colour:** paper `#f7f4ef`, surface `#fffdf9`, ink `#201f1c`, muted ink `#706d66`, line
  `#e4ded5`, brand terracotta `#df5b32`, soft brand `#f7ded3`, positive `#267a52`.
- **Type:** Outfit for both display and body. Product and shop names use 600–700 weight; supporting
  text uses 400–500. Prices use tabular numerals.
- **Shape:** 16–24px radii for containers, 12–16px for fields and images, pills for filters only.
- **Depth:** borders establish structure. Shadows are soft and reserved for interactive cards and
  the mobile order action.
- **Spacing:** 4px base rhythm. Page sections use 24–48px; card internals use 12–20px.

## Components and behaviour

- **Shop masthead:** logo (or initial fallback), merchant name, a one-line promise, and a subdued
  WhatsApp action. It stays compact and never resembles an admin navbar.
- **Search:** a full-width, labelled catalogue search with a visible reset state.
- **Search clearing:** a search has exactly one clear affordance. When a designed Clear action is
  present, add `search-with-custom-clear` so the browser-provided cancel control is suppressed;
  otherwise retain the native control. Never show both.
- **Category filter:** scrollable pills on phones. “All products” is always first.
- **Product card:** square image, manufacturer eyebrow, two-line product name, price/range, and
  availability. The whole card opens the detail page.
- **Product detail:** breadcrumb, large image, manufacturer/name, selectable variants, availability,
  price, and one WhatsApp action whose message includes the chosen option and page URL.
- **Pagination:** numbered pages with previous/next actions, a visible result range, and an automatic
  reset after search or category changes.
- **Empty/error states:** short, specific, and actionable. Missing imagery uses a calm branded
  placeholder rather than collapsing the layout.
- **Dukarun attribution:** use `<app-powered-by-dukarun>`—never hand-build the wordmark or link.
  It pairs the 12px Dukarun mark with caption-sized text, stays below merchant content at muted
  contrast, and links to `SITE_PUBLIC_URL`. It is required on shop catalogues, product details,
  secure business documents, and customer statements. Attribution must remain visible but must
  never compete with the merchant identity or the page's primary action.

## URL model

Path-based tenancy is canonical:

- Shop: `/<shop-slug>`
- Product: `/<shop-slug>/products/<product-id>`

Subdomains are not required. Every generated link, canonical URL, breadcrumb, and WhatsApp share
message must retain the shop slug.
