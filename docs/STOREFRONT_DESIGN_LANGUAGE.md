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
4. **One clear action.** Product discovery leads to a detail page and Add to basket. The basket
   leads to a pre-filled WhatsApp order, where the merchant confirms availability and total.
   Direct enquiry and sharing stay secondary. Avoid competing primary buttons.
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

## Surface and interaction hierarchy

Use the same role vocabulary as the dashboard and super-admin, expressed in this shop's warm,
light-only palette. Do not import the operational apps' dark theme or dense accounting layout.

| Role                   | Recipe                            | Use                                                                          |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Canvas                 | `--surface-canvas`                | Warm paper behind browsing and basket content.                               |
| Content                | `storefront-surface`              | Product purchasing panel and individual basket items.                        |
| Supporting information | `storefront-inset`                | Reference/ordering metadata; quieter than identity, price and actions.       |
| Chrome                 | `storefront-chrome`               | Basket header and total/action footer, separated from its scrolling body.    |
| Editable controls      | `.input`, `.select`, `.textarea`  | Inset fill, visible neutral boundary, persistent label and solid focus ring. |
| Choices                | `catalog-choice` + `aria-pressed` | Neutral border; selected option uses soft terracotta and a strong border.    |
| Primary action         | `btn-primary`                     | Terracotta fill with contrasting ink text.                                   |

Prices and totals lead through size, weight and tabular numbers; they are not orange actions.
Manufacturer and reference information use quieter text. Availability uses a small labelled,
tinted status badge. Selected variants and pack sizes must not look like competing Add buttons.
Do not use colour alone for selection, availability or validation.

The basket separates item information from quantity controls and the estimated total. Its body
scrolls within the viewport while the header and footer remain reachable. Quantity and remove
controls have 44px targets, and narrow layouts wrap without horizontal overflow.

These rules also govern catalogue search and controls on tracking, document and statement routes.
Their document/print layouts retain their existing structure. Colours live in the global theme and
surface tokens; new screens should compose these roles instead of inventing another palette.

## Components and behaviour

- **Shop masthead:** logo (or initial fallback), merchant name, a one-line promise, and a subdued
  WhatsApp action. It stays compact and never resembles an admin navbar.
- **Search:** a full-width, labelled catalogue search with a visible reset state.
- **Search clearing:** a search has exactly one clear affordance. When a designed Clear action is
  present, add `search-with-custom-clear` so the browser-provided cancel control is suppressed;
  otherwise retain the native control. Never show both.
- **Category filter:** scrollable pills on phones. “All products” is always first.
- **Catalogue views:** an accessible segmented control switches between the default image-led grid,
  a compact product list, and a category browser. Grid/list changes are presentation-only and make
  no network request. Category cards use the category name and optional description without product
  counts; choosing one returns to the shopper's last product view and loads the filtered first page.
- **Product card:** square image, manufacturer eyebrow, two-line product name, price/range, and
  availability. The whole card opens the detail page.
- **Product detail:** breadcrumb, large image, manufacturer/name, selectable variants and selling
  units, availability, price, quantity and Add to basket. Direct WhatsApp enquiry remains secondary
  and includes the chosen option and page URL.
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
