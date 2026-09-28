# Dukarun Design Language — "The Counter"

This document is the normative spec for all Dukarun dashboard UI. It is short on purpose:
the real enforcement lives in code — tokens in `apps/web/src/styles.scss` (`@theme` + global
recipes), shared components in `apps/web/src/app/shared/ui/`, and the design CI gate
(`apps/web/scripts/design.check.mjs`, run via `npm run check:design` in `apps/web`). The frozen
Vendure dashboard lives at `archive/vendure/frontend/` and is not an active reference. If this
doc and the active code disagree, **the code is wrong** — fix the code or update this doc in the
same PR.

---

## Why "The Counter"

Dukarun is a counter tool for African small shops. Cashiers use it standing up, one-handed,
on cheap Android phones, in sunlight, on spotty internet. Owners and finance use a desktop
for the back office (ledger, reports, credit). Money is the product's soul: double-entry
ledger, approvals, audit trails, credit limits, M-Pesa.

Everything on a duka counter is within reach, arranged for speed, and nothing is decorative.
That is the whole language. The five principles below derive from it.

## Principles

### 1. Money talks first

Numbers are the heroes of every screen.

- `tabular-nums` on every amount; amounts right-aligned; the total is the largest text on
  any checkout/payment screen.
- Do not repeat `KES` on every value in a list, table, product grid, or transaction panel.
  Establish currency once in the surrounding context when ambiguity is possible; compact
  amounts are the default. Receipts, exports, free-standing text, and cross-currency views
  must retain an explicit currency code.
- Semantic colour carries **state, never section identity**: `success` = received/confirmed/active,
  `error` = owed/overdue/failed, `warning` = needs attention, `info` = contextual guidance.
  Pair colour with a label or icon. Ordinary stock quantities stay neutral unless an actual
  threshold establishes a stock warning; missing optional metadata is neutral too.
  Never decorative — no gradient-tinted stat cards, no red asterisks-as-decoration.
- Muted text uses the `base-content/80|70|60` opacity ramp, never ad-hoc greys.

### 2. Sunlight-proof

Must read on a dim, glare-struck phone screen.

- Surfaces are separated by **neutral surface contrast + hairline border**, never shadow alone:
  use `surface-card` (or `card` when DaisyUI card layout is needed). Both own the same border,
  background, radius, and whisper shadow. Do not rebuild the recipe with local colour mixtures.
- No bordered card inside a bordered card — use dividers or spacing for inner grouping.
- Dark mode: depth comes from a **lighter surface**, not shadows (`--depth: 0` in the dark
  theme); heavy shadows are reserved for overlays (menus, modals) in both modes.

### 3. Counter speed

One dominant primary action per active task, in the page-header group or task action area.
An open drawer/dialog becomes the active task. Repeated records use secondary actions; only
the selected record (or the sole record) may promote its next action to primary.

- Touch targets ≥ 44px; keep create actions in the same header position at every breakpoint.
- Complex line-item and multi-step modals are full-screen on phones — encoded globally on `.modal-box` in `styles.scss`
  (`h-full` on mobile, `md:h-auto md:max-h-[90vh]` on desktop). Don't add your own
  height handling; per-modal width via `md:max-w-*` only.
- Transitions are 150–200ms, no ornamental animation in dashboard flows. Always honor
  `prefers-reduced-motion` (`motion-reduce:`) on any motion you add.
- Every async action has a loading state; every list has an empty state (use
  `EmptyStateComponent`); errors never fail silently.

### 4. Warm, not corporate

The orange is a spice, not a sauce.

- Primary orange (`#e85d2f`) is reserved for actions and brand moments. Celebration is
  allowed on success screens — expressed with colour and iconography, **not** oversized type.
- Filled primary actions use `--color-primary` orange with white `--color-primary-content`
  text/icons and 14px/600 labels in both themes, for both `appButton` and legacy DaisyUI actions.
  A fine brand-derived border defines the edge; hover/pressed fills deepen the same orange without
  moving the label. Reduced motion removes transitions. Disabled actions use a neutral inset fill
  and readable muted labels.
- Known accessibility limitation: the historical white-on-`#e85d2f` pairing is 3.48:1, below WCAG
  AA's 4.5:1 threshold for small text. This is not an AA contrast fix. Do not enlarge labels or
  substitute an unrelated action colour to work around it.
- Open till uses the shared primary treatment at 44px. Avatar initials use brand orange and white.
  Counts and step markers stay subordinate: `badge-primary` and `brand-marker` supply a quiet tint,
  while plain quantities use neutral badges.
- One font family: **Outfit**. Headings are tightened (`tracking-tight`). Corners are
  rounded but not bubbly (`--radius-box: 0.75rem`).
- Empty states and errors speak like a person, not a system log.

### 5. Desktop is the owner's office, not a stretched phone

- Phone layout is designed first, always.
- Desktop adds density and width via `lg:` enhancements (tables, accounting, reports) —
  same tokens, same components, no separate desktop design.

## Mobile ergonomics contract

The authenticated app is usable without horizontal page scrolling at every width from 320px.
Keep the first useful list record close to the controls in a 390×844 viewport. Preserve the
complete summary and critical warnings even when they move records below the first screen;
do not hide operational information to meet a fold-height target.

### Viewport containment

Meaningful content and required actions must remain reachable within the current visual viewport
at short desktop heights, from 320 CSS pixels wide, and with text enlarged to 200%. Clipping
interactive content is a design-language violation.

- Pages use document scrolling. Do not place meaningful page content behind a fixed-height
  `overflow-hidden` ancestor.
- Task modals use `.modal-box-task` with exactly one `.modal-body`. The shell owns viewport
  sizing and outer overflow; the body is the only vertical scroll owner, while the header, close
  affordance, step navigation, and footer actions remain visible.
- Short confirmations and read-only dialogs use `.modal-box-scroll`. Their whole surface may
  scroll because they do not contain a persistent task footer.
- Modal consumers may choose width only. They must not add `vh`/`dvh`, height, max-height, or
  overflow utilities and must not recreate those rules in component CSS.
- Full-screen capture surfaces, such as the barcode scanner, are explicit shared-component
  exceptions. If persistent modal chrome cannot fit in the viewport, use a dedicated route.

- The shell header is 56px. Phone page gutters are 16px, tablet gutters 24px, and desktop
  gutters 32px. Phone pages start 12px below their header and use 16px between major sections.
- The phone bottom navigation is Home, Sell, Products. The menu remains the complete navigation.
- Page headers have one title row. Descriptive subtitles hide below 768px; critical wording becomes
  a compact inline notice. Use `<app-page-actions>` with one `primaryAction`, at most one
  `utilityAction`, and mobile secondary controls in `overflowAction`.
- All phone touch targets are at least 44px. Sticky navigation and action bars include safe-area
  padding and remain usable with the software keyboard.
- Operational records use one `<app-mobile-list>` surface with divided 64–88px rows. Each row has
  identity, one supporting line, one key value/count, status, and at most one urgent action.
  Editing and destructive actions belong in the record task sheet.
- Tables are desktop-only from `lg` (1024px) and must be paired with a phone list through the
  responsive data pattern. `table-scroll` and page-level horizontal overflow are prohibited.
- Primary desktop datasets use `<app-data-table-shell>` in natural document flow. List routes
  explicitly declare `data: { listPage: true }`; the shell then removes its overflow trap. The
  document owns vertical scrolling over rows, headers, and whitespace. Column headers alone
  pin below the 3.5rem navbar (56px at standard text size) and release at the table bottom. Never bound a primary table's height.
- Declare stable `TableColumn` keys and labels, and project rows with `<ng-template tableRows>`.
  Custom header controls use `<ng-template tableHeader="key">` and render exactly once. The native
  semantic table keeps its noninteractive column headers; a separate Angular-rendered visual band
  measures native column geometry and synchronizes horizontal scrolling. No DOM cloning, vertical
  scroll handlers, or gesture interception. Expanded rows and nested tables stay native.
- Pin the leading record identity (and adjacent selection column) on desktop only. Keep opaque
  backgrounds, visible focus and keyboard-accessible horizontal scrolling. Print hides the visual
  band and restores the semantic header. Opt out with `[stickyHeader]="false"` for embedded tables.
- Phone list toolbars keep search visible. Sort uses the anchored menu; Filters opens the bottom
  sheet, applies changes immediately, exposes active filter chips/count, and ends with View results
  and Clear all. Summary metrics remain visible and wrap on phones; no More summary disclosure.
- Phone pagination is range, previous, page/total, next. First/last and page-size controls are
  desktop concerns.
- Numbered pagination requests record-area scrolling through the list return directive, after
  Angular's router scroll event. This takes precedence over an older return anchor for the same
  page. Include journal history alongside table/mobile-list surfaces; short pages clamp naturally
  at the document bottom. Local-only pagination uses the next rendered frame.

### Connectivity is app state, not page decoration

- `ConnectivityService` is the single source of truth for online/offline state. Data services and
  screens consume it; pages must not infer connectivity from dates, loaded rows, or a realtime
  subscription alone.
- The authenticated shell owns connectivity communication: while offline, show the compact header
  badge and quiet persistent strip. Healthy connectivity is the default and needs no global badge.
- Page-level status remains domain-specific (`Cached catalog`, `3 sales waiting to sync`). Do not
  repeat a generic `Offline` badge or use `Live` to mean a current date range.
- Offline copy should preserve confidence: say what remains available and that supported saved work
  will sync automatically. Do not imply every server-only action works offline.

---

## Type scale — 5 roles (dashboard)

Dashboard text never exceeds 24px. The roles are encoded as Tailwind utilities in
`apps/web/src/styles.scss` — use them, not raw size classes:

| Role      | Utility                                                   | Use                            |
| --------- | --------------------------------------------------------- | ------------------------------ |
| `hero`    | `type-hero` (24px bold, `tracking-tight`, `tabular-nums`) | Stat numbers, totals           |
| `title`   | `type-title` (20px bold tight)                            | Page, drawer and dialog titles |
| `heading` | `type-heading` / `.section-title` (14px semibold)         | Section headings               |
| `body`    | `type-body` (14px)                                        | Values, rows                   |
| `caption` | `type-caption` (12px, `/70` muted)                        | Labels, timestamps             |

- No arbitrary sizes (`text-[10px]`, `text-[11px]`) — the guard rejects them.
- Public marketing/storefront surfaces may define a separate documented scale; this five-role
  scale governs the authenticated dashboard.

### Public marketing scale (`src/app/marketing/**`)

Public pages (/, /about, /contact) use their own scale, encoded as utilities in
`apps/web/src/styles.scss` — same Outfit family, same tight tracking, same daisyUI tokens:

| Utility         | Role                                          |
| --------------- | --------------------------------------------- |
| `mkt-display`   | Hero headline (clamp 2.25–3.5rem)             |
| `mkt-h1`        | Page headline (clamp 2–3rem)                  |
| `mkt-h2`        | Section headline (clamp 1.5–2.25rem)          |
| `mkt-lead`      | Intro paragraph, `/70` muted                  |
| `mkt-eyebrow`   | Overline label (uppercase, primary)           |
| `mkt-container` | Centered page canvas with gutters             |
| `mkt-card`      | Marketing card (standard recipe + hover lift) |

The scale is implemented as utilities, not `text-*xl` classes, so the design guard needs no
exceptions and still bans oversize text everywhere else. All other rules apply unchanged on
marketing pages: `<app-icon>` only, no inline `<svg>`, no emoji, semantic colour with money
meaning, daisyUI tokens only.

## Spacing

- 4-point system: Tailwind steps `1, 1.5, 2, 3, 4, 6, 8`. No arbitrary px spacing.
- Page content lives in `<app-page>` (`PageLayoutComponent`), which owns the
  `dashboard-main` + `.page` wrapper — pages add only vertical rhythm: `space-y-6`
  between sections, `gap-2`/`gap-3` within a group. Never hand-roll the
  `dashboard-main`/`.page` boilerplate in a page template. Never add a second centered
  `max-w-*` wrapper inside it; use the standard canvas or opt the page into `[wide]="true"`.

## Icons

- System: `@ng-icons/heroicons` (outline), registered via `provideIcons()` in
  `apps/web/src/app/app.config.ts` and rendered through `<app-icon>`. Registration is centralized
  so an icon cannot work in one component scope and silently disappear in another; the design
  guard rejects unregistered literal Heroicon names.
- **No hand-authored inline `<svg>` for interface icons, and no emoji** — the guard rejects them.
  Inline SVG is appropriate when its geometry carries data: charts, plots, maps, timelines, and
  similar visualizations must declare `data-visualization="…"` on the root `<svg>`. The marker is a
  semantic exception, not an icon escape hatch: decorative and interface artwork still uses
  `<app-icon>`. Machine-generated non-interface artifacts such as printed Code 128 barcodes may be
  count-ratcheted in `design-guard.allowlist.json` when their source cannot carry the marker.
- Always use `<app-icon name="hero…">` (`IconComponent`) — sizes: `sm` (14px, with
  `text-xs`), `md` (16px, with `text-sm`, the default), `lg` (20px, standalone),
  `xl` (40px, decorative only: empty states and large placeholders). No other values.

## Depth & colour tokens

- Two shadows, defined in `@theme`: card (subtle) and overlay (strong). Nothing else.
- Radius: `--radius-box` for cards, `--radius-field` for inputs/buttons, `--radius-selector`
  for chips/toggles. No `rounded-xl/2xl/3xl` on cards.
- Colours come from the daisyUI theme only. No hardcoded hex in component styles.
- Dark mode: card surfaces (`base-100`) sit lighter than the page (`base-200`) so depth
  reads without shadows; keep `--depth: 0`.

## Information, fields, and actions

Hierarchy must still read in grayscale. Arrange a task as identity → key outcome/amount →
working content → supporting detail. Use the existing Outfit type roles and space between
groups before adding another border. A small count is not automatically a hero metric.

| Role               | Shared token / recipe                      | Contract                                                                                                   |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Page canvas        | `--surface-canvas` / `base-200`            | Quiet background between content areas.                                                                    |
| Drawer/dialog body | `--surface-panel`                          | Intermediate neutral surface behind content; shell owns scrolling.                                         |
| Content group      | `--surface-content` / `surface-card`       | Raised in dark mode, white on the light canvas. One frame per group.                                       |
| Supporting detail  | `--surface-inset` / `surface-inset`        | Recessed history, context, or empty state within a group; no second card border.                           |
| Editable control   | `.input`, `.select`, `.textarea`           | Inset fill and `--control-border`; permanent label above. Includes searchable choices and compound inputs. |
| Secondary action   | `--surface-action` / `appButton` secondary | Neutral filled button, distinct from an inset field.                                                       |
| Primary action     | `appButton` primary                        | Brand orange with white text; one dominant next action per task. See the contrast limitation above.        |
| Disclosure         | `.detail-disclosure`                       | Full-width neutral row, chevron, 44px target, `aria-expanded`; never looks like a save button.             |

- Read-only data uses plain label/value text or a `dl`, not disabled inputs. Manufacturer,
  barcode, tax PIN and category are supporting information; absent optional values are quiet.
- Forms use `app-form-section` to group related fields. Its surface is flattened automatically
  inside an existing content card, avoiding bordered cards within cards. Field boundaries remain.
- Input focus has a visible orange ring. Validation retains its error border and message;
  focus, selection, disabled, loading and expanded states must remain distinguishable.
- Status badges use a restrained tinted fill (`badge-soft`) with a readable label. Do not
  colour whole cards by department or give every metric a different colour.
- Primary, secondary and ghost actions express priority. Printing and sharing are utilities;
  history is a disclosure. Repeated variant actions stay neutral until a variant is selected.
- Empty supporting sections use a short sentence in an inset region. Large illustrations and
  extra bordered containers are unnecessary for an empty history inside a record.
- Surface tokens resolve in both themes, including nested theme scopes. Put new colours only
  in theme tokens; do not introduce per-screen palettes or arbitrary input backgrounds.
- Keep body/metadata readable, control borders distinguishable, touch targets at least 44px,
  and keyboard focus visible. Validate both themes, 320px phones, short desktops and 200% text.

### Dashboard application map

These rules cover the merchant dashboard and the super-admin console. The console retains its
warmer neutral palette and existing desktop density, with the same surface and interaction roles.
Its tokens and control recipes live in `apps/super-admin/src/styles.scss`; shared console drawers,
status badges, company details and campaign reviews follow this contract too. Storefront adapts
the roles in `STOREFRONT_DESIGN_LANGUAGE.md`; marketing retains its separate presentation.

| Area                           | Application                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Product details                | Stock/value summary leads; variant count and optional metadata recede; variant actions precede stock/purchase disclosures.     |
| Purchase details               | Invoice/payment metrics above distinct items, payments and task sections; tax information remains read-only.                   |
| Customer and supplier accounts | Balances lead; contact/tax metadata is plain; financial tasks and history have separate groups.                                |
| Product and supplier editing   | Related fields share a content surface; editable controls are inset; task chrome remains visible.                              |
| Settings and other task forms  | Existing cards and shared form sections inherit surface roles; preference descriptions remain subordinate to controls.         |
| Lists and reports              | Shared toolbar, stat cards, data-table shell and mobile list use the same content surface; headers and dividers organize rows. |
| Sell and checkout              | Catalog/cart/checkout cards separate from the canvas; controls are inset; total and payment action retain priority.            |

Future screens must compose these recipes rather than copy a finished screen's utility-class
stack. Shared changes propagate to all consumers; screen-specific changes should correct
information order, not invent new colours.

## Shared primitives (`apps/web/src/app/shared/ui/`)

Compose pages from these — never hand-roll what a primitive owns:

- **`<app-page>`** — the page shell. Owns `dashboard-main` + `.page`; pass `title` (+
  optional `subtitle`, `badge`, `backLink`) for the standard header and project header
  actions into the `[actions]` slot. `wide` bumps the wrapper to max-w-7xl.
- **`<app-form-section title="…">`** — one related field group, raised on a task canvas and
  unframed inside another content card. Optional description and `[sectionAction]` slot.
- **`<app-form-field label="…">`** — one field recipe (label above the inset control, optional
  `hint` / `error`, `required` marker). Wrap every input/select in forms; add `w-full` to
  the projected control. No bare `form-control`/`label-text` blocks.
- **Searchable entity choices** — native `<select>` is only for small, intrinsically bounded
  enumerations (roughly ten options or fewer: status, mode, settlement). Any party, catalog, or
  other entity list that can reasonably grow past ten uses `<app-searchable-filter>` or a server
  typeahead, even when today’s fixture has only a few rows. Search matches identifying secondary
  text (for example supplier phone/email or product SKU), limits the visible result set, and keeps
  keyboard/combobox semantics. The ten-item threshold is a design heuristic, not a data cap.
- **`<button appButton>` / `<a appButton>`** — one action idiom: `variant="primary|secondary|soft|outline|ghost|error"`,
  `size="sm|md"`, `[iconOnly]` for square icon actions, and `[loading]` to swap in a spinner
  and disable. `primary` is the one page/sheet CTA; `secondary` is a quiet filled action;
  `soft` is a low-emphasis primary-tinted action; `outline` is an alternative secondary treatment
  and `ghost` is a utility action.
  Use `soft`, not `primary`, for a selected method/filter so the CTA remains singular.
  Variants never change button geometry. No raw `btn btn-*` strings for standard actions
  (tight table-row clusters may stay raw by exception).
- **`<app-money [amount]>`** — the only way to render money: compact tabular-nums by default,
  `[showCurrency]="true"` only where context does not already establish KES,
  `direction="in|out"` for money-meaning colour, and `masked` for hidden figures. Never
  `{{ formatKes(...) }}` in templates (string composition in TS, e.g. option labels, is fine).
- **`<app-icon>`** — icons on the 4-size scale (see Icons).
- **`<app-page-actions>`** — the only page-header action group. Project one control into
  `[primaryAction]`, an optional refresh/status control into `[utilityAction]`, and secondary
  controls into `[overflowAction]`. Overflow controls render inline on desktop and in one menu
  on phones.
- **`<app-route-navigation>`** — cross-route navigation inside one workspace. Pass related
  `{ route, label, icon? }` items and a short workspace label. It renders a quiet desktop row and
  a labeled phone selector, owns active-route matching, and disappears when only one route is
  available. Permission-aware workspaces use `<app-workspace-navigation>`, which composes this
  primitive from `WorkspaceNavigationService`.
- **`<app-section-tabs>`** — state-backed switching within a page. Pass `{ value, label }` items,
  the active value, and an accessible label. Use `presentation="primary"` when those values are the
  page's primary sections (Settings), and the default segmented presentation for secondary peer
  views inside a selected section. Both presentations always use a labeled native dropdown below
  768px; no per-page opt-in or horizontally scrolling phone tabs.
- **`<app-mobile-list>` / `<app-responsive-data-view>`** — the shared phone list surface and
  desktop/mobile pairing boundary. Domain pages own row content; the primitives own visibility,
  border, radius, and dividers.
- **`<app-drawer>`** — bottom task sheet below 768px and 480px right-side drawer above it:
  `[(open)]`, `title`, optional `subtitle`, `dirty`, `mobileDismissLabel`, a `[leading]` header
  slot, a `[drawerActions]` header slot, `[drawerFooter]`, and a scrollable projected body. Backdrop,
  Escape, close, and footer dismissal all use the same close request. Drawers do not add synthetic
  browser-history entries; route-level overlays must model their open state in the route itself.
  The phone sheet is auto-height up to 92dvh with sticky header/footer and safe-area padding.
  Read-only sheets keep Done visible; forms keep Cancel and Save visible. Dirty forms confirm
  before discarding. Opening traps focus and locks background scroll; closing restores both.
  Close is two-phase: the panel plays its exit transition, then `(closed)` emits — parents
  clear their selection there, not on `openChange`. Keep the selected row highlighted while
  the drawer is open.
  Group conditional header actions in a direct `<ng-container ngProjectAs="[drawerActions]">`;
  placing them inside the same multi-root `@if` as body content sends them into the body slot.
  - Motion: panel slides in from the right (ease-out, 200ms) and out (ease-in, 150ms),
    backdrop fades; both are disabled under `prefers-reduced-motion` (`motion-reduce:`).
    This is the sanctioned overlay motion — don't invent others.
  - Drawer body sections stack in one column: `surface-card` content groups with
    `.section-title` headings, stat summary via `app-stat-card` pairs, forms
    via `app-form-field`. History lists are two-line rows (`divide-y divide-base-200`,
    primary `text-sm font-medium` + `type-caption` secondary, amount right-aligned
    `tabular-nums`), not wide tables; long lists cap at `max-h-80 overflow-y-auto`; empty
    sections use `app-empty-state` compact. Detail fetches show a centered
    `loading-spinner` block until data arrives.
  - Only short, single-section edits happen inside the drawer. Multi-section or conditional
    forms close the drawer first and use `app-task-dialog`; save or cancel may then return to
    the refreshed detail drawer. Never stack two overlays or widen a drawer to fit a task.
- **`<app-task-dialog>`** — the shared blocking task surface: full-screen on phones and a
  bounded 672/768px dialog on desktop, with a fixed header and action footer around one
  scrollable body. It owns focus trapping/restoration, background scroll lock, Escape,
  safe-area padding, dirty-change confirmation, and a fixed task-level error region.
  Bind command failures to its `[error]` input so feedback remains visible inside the active
  modal; keep field validation beside the affected field and never send modal errors to a
  page banner behind the backdrop. Compose forms with `app-form-section` content groups and
  `app-preference-row` switches. Use it for multi-section, conditional, or transactional
  work; do not reproduce hand-rolled modal chrome.
- Plus the existing shells: `app-page-header` (inside `app-page`), `app-stat-bar`,
  `app-stat-card`, `app-status-badge`, `app-empty-state`, `app-list-search-bar`,
  `app-pagination`, `app-data-table-shell`, `app-entity-avatar`, `app-mobile-fab`,
  `app-delete-confirmation-modal`.

Global recipes in `styles.scss` complement them: `.card`, `.form-field` (used by
`app-form-field`), `.section-title`, `.modal-box`, `.nav-item`, table header chrome.

## The List Page (canonical layout)

Every list page is the same four blocks, top to bottom — no improvisation:

1. **`<app-page title="…" [wide]="true">`** — list pages share the wide table canvas and
   standard header. Stats strip via `app-stat-bar` pills
   (tones are money-meaning only — neutral totals, warning/error for states that need
   action; the bar's zero-guard handles the rest). Project one `<app-page-actions>` into the
   page `[actions]` slot. Put the create control in `[primaryAction]`, refresh/status in
   `[utilityAction]`, and secondary navigation in `[overflowAction]`. Never put create in the
   table footer or a floating row. Related navigation uses a domain icon; reserve `heroPlus`
   for create. Refresh includes a tooltip, accessible label, and loading state but no visible
   text label.
2. **`<app-list-search-bar>`** — on wide list surfaces, search, summary and sorting share one row.
   Keep search at a useful bounded width and show summary values above their labels between search
   and sort. At narrower widths the complete summary wraps below search; phone summaries use two
   columns. A divided second row contains visible quick filters, dataset scope and advanced Filters.
   Sales keeps Status and Customer directly visible, followed by dates and period shortcuts.
   Catalogue keeps Status, Stock status, Supplier, Manufacturer and Category directly visible in
   one desktop filter row; labelled controls wrap into two columns on phones. Keep catalogue counts
   and stock valuation in distinct summary groups, with readable values above concise labels.
   Inside an existing panel, use the toolbar's `embedded` presentation to avoid a second card and
   duplicated padding. With no summary, search and quick filters share a row when space permits.
   Credit has two peer views: **Overview** and **Customer / supplier standings**, with the view in the URL.
   Overview leads with a compact business-wide summary strip, then exposure by due status and
   balance trends, followed by Collect now / Pay soon and customer credit risk. Keep all supplied
   metrics visible, including net balances, overdue invoices, severe exposure, bills due soon,
   over-limit accounts and concentration. Net balances and gross invoice exposure remain distinct.
   Aging uses aligned bucket/amount/document-count/share rows. Risk modules take their natural
   height; keep all five largest balances visible with names, amounts and shares.
   Customer / supplier standings puts the customer/supplier switch, search, credit band and Overdue only directly
   above records. Standings uses the existing risk-ordered cursor query, 25 records per page by default,
   a visible page-size selector, and Previous/Next controls above and below records. Show a record
   range; show an exact total only once the cursor is exhausted. Keep page/pageSize in the URL,
   reset the page for filter changes, and reuse loaded records for Previous and detail returns.
   View switches preserve filters, loaded pages and return position; Find an account
   deliberately focuses search. Legacy filtered URLs open profiles. Both views remain mounted,
   keeping the trend selection and profile state without duplicate requests. The existing in-memory
   list snapshots support detail returns; no business rows are persisted to browser storage.
   Desktop filter controls use a consistent 36px height; phones retain 44px touch targets. Search and
   sorting retain their 44px controls. Custom history dates form a pair on phones.
   Keep every existing summary metric visible on every
   viewport; wrap the bar rather than hiding information. Label metrics as matching results, current page,
   or entire business, and preserve financial visibility rules.
   Keep search visible and debounce it by 250ms once. Discrete filters apply immediately. Custom
   analytical date ranges apply after both dates are valid. History pages with optional endpoints
   use `app-history-date-range`: Between, Since, Until and All time. Incomplete or reversed drafts
   show guidance and preserve the applied results/URL. Histories have no analytical 12-month cap;
   keep existing `from`/`to` names and endpoint semantics. Dataset changes reset pagination. Advanced filters
   use the desktop inline **Filters** disclosure and the existing phone bottom sheet. Removable
   active-filter chips and **Clear filters** remain outside the disclosure. The sheet traps focus,
   closes with Escape, and returns focus to its trigger.
   Give search a domain-specific `searchLabel`; placeholders describe searchable fields. The
   primitive owns its single clear button and `search-with-custom-clear` suppression. Project
   visible scope into `[scope]`, summary into `[summary]`, quick choices into `[quickFilters]`, and
   advanced controls into `[filters]`. Render each filter once. Supplied active chips determine
   badge counts and clear availability; the numeric count is only a legacy fallback. Search and
   date/location scope do not count as filters. Clear filters/Clear all preserve search and scope;
   offer separate Clear search, Reset dates and Current location actions where appropriate.
   Use `StatItem.emphasis` (or legacy `mobilePriority`) for visual weight only, never visibility.
   Keep grouping at page level; a single count can be inline text rather than a full metric strip.
3. **Data surface** — desktop: `<app-data-table-shell>` containing a semantic table with
   secondary Review navigation to the detail view (row activation may also open it); mobile: `<app-mobile-list>`
   with compact domain-owned rows. Use `<app-responsive-data-view>` when the two forms share
   one boundary. Separate shadowed record cards and horizontally scrolling tables are not
   mobile list patterns. Empty state = `<app-empty-state>`.
   Customer and supplier tables fit their available desktop width: use column widths
   on `TableColumn`, wrap explanations and row actions, and avoid fixed minimum table
   widths. A short account list must have no internal horizontal or vertical overflow.
4. **`<app-pagination>`** — the shared component, placed outside the data-table shell with
   `mt-3` so pagination has the same breathing room on table and mobile-card layouts. Primary
   datasets use database counts and `.range()` pagination. Page-size and first/last controls
   are desktop-only; phone pagination remains range, previous, page/total, next. Client-side
   slicing is reserved for already-loaded embedded detail lists. No hand-rolled `join`
   pagination. Preserve existing page sizes and sort choices. Numbered page changes return to the
   record area; Load more appends without moving the viewport.

Reproducible search, filters, sort, dates, page, and page size belong in the URL, preserving existing
parameter names and deep links. Shared list helpers retain return anchors, neighboring record IDs,
horizontal position, and loaded batches in memory only, scoped to company, user, location, and
permissions. Restore after records render, using the nearest saved neighbor if the record vanished,
then a clamped position. User interaction cancels pending restoration. Shared URLs refetch records;
loaded batches are a same-session convenience. Clear snapshots on sign-out, scope/permission changes,
and catalog/party revision changes; reject responses from older requests. Keep existing records visible
while updating and distinguish request failures (with Retry), empty datasets, and no filter matches.

Product identity includes manufacturer beneath the name in catalog, stock priorities, adjustments,
transfers, and product performance. Manufacturer is default information, never hover-only detail.
Append a variant only when it distinguishes the product; do not repeat a pack name already present
in its display label. Long names and manufacturers wrap rather than losing their identifying text.

Organize rich information before introducing disclosure. Group related summary metrics under one
accurate scope label (for example product counts, stock valuation, and selected-period sales). Keep
business totals, money direction, risk, overdue amounts, and actionable exceptions visible. Suppress
empty placeholders where they add no decision value; retain actual contact notes and identifiers.
Selective disclosure is appropriate for supporting evidence with a clear label: dashboard product
leaders show their category's deciding measure, manufacturer, confidence, on-hand stock, planning
cover, and stockout warnings. Trending also shows exact current/previous adjusted units.
**Evidence & stock** holds the remaining comparison, order history and permitted financial
figures. The product link and disclosure are separate targets. Confidence explanations use a native
touch/keyboard disclosure, not hover alone. Staff rows surface nonzero refunds/voids and held
exposure when either count or value is nonzero; **Gross, refunds & held sales** and Review
preserve the supporting measures. Do not use a generic More control to conceal essential summaries.
Dashboard chart values and unambiguous weekdays remain visible without hovering; **Daily details**
provides the exact daily breakdown. When leader cards share a location, show its scope once in the
section heading. Financial permissions still govern every primary and expanded value.

Stock priorities lead with priority/reason/confidence, current planning cover, on-hand stock,
suggested reorder units, and factual units/change in the selected sales period. The compact desktop
heading is **Period sales**; its selected dates and presets remain visible above the results. Only
custom date inputs need disclosure. A zero previous quantity reads **No previous sales**, or
**No sales in either period** if both are zero. Group selected-period sales metrics separately from current
inventory and planning estimates; keep those summary values visible. Show filtered result counts
separately when a priority filter is active. Needs attention means
exactly stockout, reorder, or low cover; count/filter before pagination. Deploy migration
`20260927000005_0197_product_decision_counts.sql` before this frontend.

Catalog rows show the first assigned category and a named **+N categories** control opening all
categories in the drawer. Show Uncategorized only when category data is complete; otherwise show
the loading/reconnect status. Keep manufacturer, selection and bulk actions available.

Expense/transfer history rows keep date, memo, calculated amount and account context visible.
Use **Paid from** for a simple standalone expense and **From → To** for a simple transfer. Compound,
purchase-generated or incomplete entries use neutral **Accounts** wording with account names/codes.
The account context and **Account lines** disclosure share one compact line; collapsed detail has
no empty body padding or divider. Keep full debit/credit lines in the expansion and existing totals.

Sell retains its existing product-selection, cart, and payment workspace. List-route scrolling does
not apply to it. Task-focused count, transfer, cashier, reconciliation, and period-close controls also
retain their workflows; their task controls and critical notices may precede the first mobile record.

Pages without countable state may omit stats (rare); pages whose entities originate
elsewhere (sales from the POS) omit the create action.

### Create and edit panels

Create/edit placement follows the four-surface rule (see "Detail & edit surfaces"
below). Short single-section forms may live in drawer edit mode; multi-section forms use
the shared task dialog, and complex editors use a dedicated route. Inline top-of-page panels are retired for
drawer-backed entities; where one remains, it opens immediately below the page header
and uses the same card for both modes: full-width title and one-line context,
responsive 2/4-column field grid, primary save + ghost cancel on one full-width row.
The same header action opens create on desktop and mobile; do not duplicate it as a
FAB or move it into the list toolbar.

## Detail & edit surfaces (the four surfaces)

Every entity gets **one** detail surface and **one** edit surface, chosen by content
weight — never improvised per page. The four legacy idioms (inline `tr.row-detail`
entity detail, hand-rolled per-page modals, separate routes for inspection, inline
top-of-page edit cards) are prohibited for drawer-backed entities. The rollout is
complete; use the rules and explicit exceptions below for all new work.

1. **Detail → the drawer (`app-drawer`).** The default for record detail. Row click
   opens it (no "View" buttons, per the row language); the row stays highlighted
   while open. The drawer holds the stat summary, history lists, and **lightweight
   single-entity flows** — repay, pay, refund, void, credit-terms edit. Content is
   one column per the drawer section patterns above.
2. **Simple edit → drawer edit mode.** A short form with one semantic section and no
   conditional branches may edit in place. Field count is a warning, not the deciding rule:
   if the action footer regularly scrolls away or the form needs section navigation, move it.
3. **Multi-section or blocking work → task dialog.** Customer profiles, checkout details,
   session actions, and similar focused tasks use `app-task-dialog`. Close an inspector before
   opening the task; save or cancel may restore it, but overlays are never stacked.
4. **Complex work → dedicated route.** Editors with
   line-item grids, multi-step wizards, or blocking transactional steps (product
   editor with its variant grid, purchase recording) never squeeze into an overlay.
   They use a full page or workspace.

Scoping rules:

- `tr.row-detail` survives only for **read-only accounting metadata** (ledger/journal
  DR/CR lines, approval payloads) and **speed-critical queues** (cashier queue). Anything
  with an entity identity and a history gets a drawer.
- Read-only drill-downs (staff performance daily table, proforma preview) are
  drawers too — "peek and dismiss" is the drawer's core affordance.
- Blocking transaction steps (checkout, session open/close) stay modals: a drawer
  implies casual dismissal, which is the wrong affordance mid-transaction.

**Trend/insight cards** — the legacy app used a collapsible `<app-trend-card>` for analytics
panels on list pages; it has not been ported to `apps/web` yet. Until it is, keep analytics
panels in a standard `card` with a `.section-title` heading, one per page, between the
header and the search bar.

## The Dashboard Page (canonical layout)

The operational dashboard is a dense owner view, so it uses `<app-page [wide]="true">` and
the full `page-wide` canvas. It is not a narrow feed or a collection of floating widgets.

1. **Page identity** — title is always “Dashboard”; business name and context belong in the
   subtitle. Connection state and refresh are compact header actions.
2. **Today first** — the first section is a four-card `app-stat-card` grid. Use `gap-3`, two
   columns on phones and four from `lg`. Never show zero-value empty data while the initial
   request is loading; use a dash or loading state.
3. **Performance surfaces** — trend and ranking cards share one responsive 12-column grid.
   Card titles and captions live inside a bordered card header, followed by one table or one
   embedded empty/loading state. The primary trend may take seven columns and the supporting
   ranking five; both collapse to one column below `xl`.
4. **Exceptions last** — low stock, expiry, sync failures, and similar operational alerts use
   warning/error only when action is required. Exception lists use the two-line row language
   inside two equal cards; healthy states use `app-empty-state`.
5. **Rhythm** — wrap dashboard sections in `space-y-6`; use `gap-4` between major desktop
   surfaces and `gap-2`/`gap-3` within a component.

Live dashboards must show the last successful refresh time, preserve existing data during a
background refresh, and provide explicit initial loading, error, and empty states.

## The Counter Workspace (Sell)

Sale lines keep price decrease, exact price editing, price increase, and quantity controls
visible without opening details. These are primary counter actions, including on mobile.
Use distinct, labelled compound controls with at least 44px touch targets. On phones, keep price and quantity side by side with compact compound controls. Stack only
when the available width cannot fit six 44px targets, including at enlarged text sizes.
Product identity and line total lead each row; SKU, manufacturer, and other reference details
can expand below it. Keep the original price and reset immediately beneath the price control.
Use a standalone sale heading, stronger item names and totals, a restrained primary tint for
price controls, and neutral quantity controls to distinguish summary, actions, and reference data. Give each sale line a complete border and its own content surface, separated by a narrow
canvas-colored gap. Do not enclose the list in another card or shaded tray. Prioritize manufacturer and pack contents beneath the item name; keep SKU in expanded
details. Product names have no carets. Underlined selling-unit text opens unit selection;
up/down arrows are reserved for price adjustment. Give Current sale a strong section heading
and Clear cart an outlined button, with confirmation retained. The boundary encloses its controls, price note, and expanded editor so
the whole item reads as one unit. Keep the controls themselves flat within that boundary. Validate populated carts
with packs and services in both themes and at 320px width.

Sell is an explicit workspace variant, not an exception from the design system. It uses
`<app-page [workspace]="true">`, which keeps the standard page header, gutters, wide canvas,
tokens, fields, buttons, money rendering, and modal shell. The workspace may use three
counter-speed patterns that ordinary pages may not copy without adopting this variant:

- a product selector grid inside the search surface instead of a data table;
- a sticky desktop sale summary beside the working cart;
- one fixed mobile payment bar above the global bottom navigation.

The desktop and mobile payment buttons are responsive representations of the same primary
action and are never visible together. Checkout still uses the global `.modal-box` contract;
product tiles are interactive selectors, not nested cards. Workspace-specific layout must not
introduce another page-width wrapper.

## Cross-ledger credit view

`Money → Credit` owns the read-only accounting view across customer receivables and supplier
payables: combined exposure, net position, aging, terms, limits, and available credit. It maps
both domains into one row model and one table. Customer/supplier creation, editing, payments, and
history remain on their operational pages; do not duplicate those workflows inside Money.

## Navigation chrome (sidebar / bottom nav)

One recipe, encoded in `styles.scss`: `.nav-item` (sidebar links, drawer links, footer
links) and `.bottom-nav-item` (mobile tab bar). Ghost by default, 4pt rhythm, 44px
targets, icons inherit state color. Small selected labels use the shared brand-derived
`--text-accent` tone, which deepens in light mode and lightens in dark mode without changing
the main orange action fill. Exactly **one active signifier**: the tinted
container (`.nav-item-active` / the icon pill in `.bottom-nav-active`) — no indicator
bars, dots, gradients, or weight games on top of it. Apply the active class via
`routerLinkActive`. Never hand-roll nav rows in shell files.

### Section tabs

Navigation has two visual levels, based on hierarchy rather than implementation. Primary sections
use the quiet row with one tinted active item and a labeled phone selector. Use
`<app-route-navigation>` (or `<app-workspace-navigation>`) when sections are routes, and
`<app-section-tabs presentation="primary">` when they are local page state, as in Settings.

Secondary peer views inside the selected section use `<app-section-tabs>` with its default
segmented presentation, which owns the global `.section-tabs` surface and `.section-tab` items. The
group is content-width, horizontally scrollable when necessary, and uses the standard box and field
radii. `.section-tab-active` is the only active signifier: a quiet primary tint with readable
`--text-accent` text. Inactive labels use `--text-muted`. Do not use underline-only tabs, square
outlines, full-width empty tab bars, or page-specific tab geometry. Below 768px, both navigation
levels use labeled native dropdowns, with the active value synchronized on first render, route
changes, and permission-filtered options. Keep selectors within their container and leave compact
toolbars unchanged. Use the shared components rather than duplicating mobile/desktop markup.

Ranking, sorting, dates, locations, search, and filters are scope controls—not navigation. Put them
in the page toolbar or filter row with permanent labels; never represent them as another tab level.

Wizard steps and in-flow choices such as payment methods are not section navigation and keep their
own purpose-specific patterns.

## Tables (the row language)

Header chrome is encoded globally (`.dashboard-main .table thead th`): uppercase 12px
semibold, shared `--text-muted`, hairline divider. `type-caption`, table supporting text and catalog
metadata use this same readable 70% tone instead of ad-hoc 50–55% text. Never style `<th>` per page.

Customer and supplier account tables add `.account-table`, a shared fixed six-column rhythm:
identity, contact, domain context, aging/terms, balance, and actions. Archive/deleted status stays
beside the entity name rather than consuming a column; money remains right-aligned and actions stay
compact. Do not add a seventh status or metadata column when the information belongs to identity or
account context.
Rows follow one vocabulary — same meaning, same shape; different data, different cells:

- **Density**: cells are `vertical-align: middle` (encoded); one line per cell where
  possible. A cell may stack exactly two lines: primary `text-sm font-medium`, secondary
  `text-xs text-base-content/60` (a date under a code, a caption under an amount).
- **First cell** carries the entity: avatar (`app-entity-avatar` sm) + name, or the
  record's code as a `link link-hover font-medium`.
- **Numbers**: right-aligned, `tabular-nums`, `font-medium`; semantic colour only for
  money meaning (owed = error, in-your-favour = success). Empty value = `—` in
  `text-base-content/40`, never blank.
- **Status**: `app-status-badge` (or one badge component) — inline `flex flex-wrap gap-1`,
  never a vertical stack that inflates row height.
- **Actions**: right-aligned ghost icon buttons only (`btn btn-ghost btn-xs` + `title`),
  `$event.stopPropagation()` on the cell. The row itself navigates
  (`hover cursor-pointer` + row click); **labeled "View" buttons are forbidden**.
- **Expanded detail rows**: `tr.row-detail` is reserved for read-only accounting
  metadata (ledger DR/CR, audit payloads) and speed-critical queues — one
  `tr.row-detail` with a single full-width `td` (inset surface is encoded). No
  second zebra inside, no nested bordered boxes. Entity detail belongs in the
  drawer (see "Detail & edit surfaces"), not in an expanded row.
- **Shared cell recipes**: `.table-entity` contains avatar + name, `.table-primary` and
  `.table-secondary` form the allowed two-line hierarchy, `.table-number` owns right-aligned
  tabular values, and `.table-actions` owns the final icon-action cell. These recipes and all
  cell spacing/hover/selected/footer states live in `styles.scss`; pages do not restyle them.

## Enforcement checklist (review + `npm run check:design` in `apps/web`)

- [ ] No dashboard text > `text-2xl`; titles/hero numbers are `tracking-tight`; amounts are `tabular-nums`.
- [ ] One card recipe; no nested bordered boxes; heavy shadows only on overlays.
- [ ] Semantic colour only with money meaning; muted text via `base-content/xx`.
- [ ] Interface icons via `<app-icon>`; zero unapproved inline `<svg>`; zero emoji.
- [ ] Pages composed via `<app-page>`; forms via `<app-form-field>`; actions via `appButton`; money via `<app-money>`.
- [ ] Modals via the shared shell (`.modal-box`, full-screen on mobile).
- [ ] Task modals use `.modal-box-task` + one `.modal-body`; short/read-only dialogs use `.modal-box-scroll`; no consumer-owned viewport sizing or overflow.
- [ ] Loading, empty, and error states present; touch targets ≥ 44px; phone layout first.
