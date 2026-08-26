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
- Semantic colour is **money meaning only**: `success` = received/positive, `error` =
  owed/overdue/failed, `warning` = needs attention, `info`/primary = neutral emphasis.
  Never decorative — no gradient-tinted stat cards, no red asterisks-as-decoration.
- Muted text uses the `base-content/80|70|60` opacity ramp, never ad-hoc greys.

### 2. Sunlight-proof

Must read on a dim, glare-struck phone screen.

- Surfaces are separated by **hairline border + whisper shadow**, never shadow alone:
  the one card recipe is `rounded-box border border-base-300/60 bg-base-100 shadow-sm`.
- No bordered card inside a bordered card — use dividers or spacing for inner grouping.
- Dark mode: depth comes from a **lighter surface**, not shadows (`--depth: 0` in the dark
  theme); heavy shadows are reserved for overlays (menus, modals) in both modes.

### 3. Counter speed

One primary action per screen, in the standard page-header action group.

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
- One font family: **Outfit**. Headings are tightened (`tracking-tight`). Corners are
  rounded but not bubbly (`--radius-box: 0.75rem`).
- Empty states and errors speak like a person, not a system log.

### 5. Desktop is the owner's office, not a stretched phone

- Phone layout is designed first, always.
- Desktop adds density and width via `lg:` enhancements (tables, accounting, reports) —
  same tokens, same components, no separate desktop design.

## Mobile ergonomics contract

The authenticated app is usable without horizontal page scrolling at every width from 320px.
The first useful list record should be visible in a 390×844 viewport unless a critical warning
must precede it.

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
- Phone list toolbars keep search visible. Sort uses the anchored menu; Filters opens the bottom
  sheet, applies changes immediately, exposes active filter chips/count, and ends with View results
  and Clear all. Phone summaries expose exactly two primary metrics before More summary.
- Phone pagination is range, previous, page/total, next. First/last and page-size controls are
  desktop concerns.

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

| Role      | Utility                                                   | Use                                          |
| --------- | --------------------------------------------------------- | -------------------------------------------- |
| `hero`    | `type-hero` (24px bold, `tracking-tight`, `tabular-nums`) | Stat numbers, totals                         |
| `title`   | `type-title` (20px bold tight)                            | Page titles only (via `PageHeaderComponent`) |
| `heading` | `type-heading` / `.section-title` (14px semibold)         | Section headings                             |
| `body`    | `type-body` (14px)                                        | Values, rows                                 |
| `caption` | `type-caption` (12px, `/60` muted)                        | Labels, timestamps                           |

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
- **No inline `<svg>`, no emoji, ever** — the guard rejects them.
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

## Shared primitives (`apps/web/src/app/shared/ui/`)

Compose pages from these — never hand-roll what a primitive owns:

- **`<app-page>`** — the page shell. Owns `dashboard-main` + `.page`; pass `title` (+
  optional `subtitle`, `badge`, `backLink`) for the standard header and project header
  actions into the `[actions]` slot. `wide` bumps the wrapper to max-w-7xl.
- **`<app-form-field label="…">`** — one field recipe (label above the control, optional
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
  `soft` is a low-emphasis primary-tinted action; `outline` and `ghost` step down from there.
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
- **`<app-mobile-list>` / `<app-responsive-data-view>`** — the shared phone list surface and
  desktop/mobile pairing boundary. Domain pages own row content; the primitives own visibility,
  border, radius, and dividers.
- **`<app-drawer>`** — bottom task sheet below 768px and 480px right-side drawer above it:
  `[(open)]`, `title`, optional `subtitle`, `dirty`, `mobileDismissLabel`, a `[leading]` header
  slot, an `[actions]` header slot, `[drawerFooter]`, and a scrollable projected body. Backdrop,
  Escape, close, and footer dismissal all use the same close request. Drawers do not add synthetic
  browser-history entries; route-level overlays must model their open state in the route itself.
  The phone sheet is auto-height up to 92dvh with sticky header/footer and safe-area padding.
  Read-only sheets keep Done visible; forms keep Cancel and Save visible. Dirty forms confirm
  before discarding. Opening traps focus and locks background scroll; closing restores both.
  Close is two-phase: the panel plays its exit transition, then `(closed)` emits — parents
  clear their selection there, not on `openChange`. Keep the selected row highlighted while
  the drawer is open.
  - Motion: panel slides in from the right (ease-out, 200ms) and out (ease-in, 150ms),
    backdrop fades; both are disabled under `prefers-reduced-motion` (`motion-reduce:`).
    This is the sanctioned overlay motion — don't invent others.
  - Drawer body sections stack in one column: `.section-title` headings separated by
    hairline `border-t border-base-300/60`, stat summary via `app-stat-card` pairs, forms
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
  page banner behind the backdrop. Compose forms with unframed `app-form-section` groups and
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
2. **`<app-list-search-bar>`** — the common list top bar. Its first row hosts the compact
   search field and lightweight `app-stat-bar` in `[summary]`. Optional `[filters]` sit in a
   quieter divided row below so dense filter controls never distort the shared list identity;
   `[badges]` may wrap underneath. The primitive owns block layout, `p-4`, and `mb-4`, aligning
   its contents with table-shell headers and cells while guaranteeing the same gap before every
   data surface. Pages must not wrap it just to recreate that spacing. No detached stat-card
   grids, custom search rows, or bare `input-bordered`.
   The primitive owns its single clear button and applies `search-with-custom-clear` to suppress
   the browser's native cancel control. Any other search that supplies a custom clear action must
   use the same class; searches without a custom action keep native clearing. Two clear controls
   are always a design-language defect.
3. **Data surface** — desktop: `<app-data-table-shell>` containing a semantic table with
   row-click navigation to the detail view (no "View" buttons); mobile: `<app-mobile-list>`
   with compact domain-owned rows. Use `<app-responsive-data-view>` when the two forms share
   one boundary. Separate shadowed record cards and horizontally scrolling tables are not
   mobile list patterns. Empty state = `<app-empty-state>`.
4. **`<app-pagination>`** — the shared component, placed outside the data-table shell with
   `mt-3` so pagination has the same breathing room on table and mobile-card layouts. Primary
   datasets use database counts and `.range()` pagination. Page-size and first/last controls
   are desktop-only; phone pagination remains range, previous, page/total, next. Client-side
   slicing is reserved for already-loaded embedded detail lists. No hand-rolled `join`
   pagination.

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
targets, icons inherit state color. Exactly **one active signifier**: the tinted
container (`.nav-item-active` / the icon pill in `.bottom-nav-active`) — no indicator
bars, dots, gradients, or weight games on top of it. Apply the active class via
`routerLinkActive`. Never hand-roll nav rows in shell files.

### Section tabs

Peer views inside a workspace use the global `.section-tabs` surface and `.section-tab` items.
The group is content-width, horizontally scrollable when necessary, and uses the standard box and
field radii. `.section-tab-active` is the only active signifier: a quiet primary tint with primary
text. Do not use underline-only tabs, square outlines, full-width empty tab bars, or page-specific
tab geometry. On phones, multi-view workspaces may replace the strip with a labeled select.

Wizard steps and in-flow choices such as payment methods are not section navigation and keep their
own purpose-specific patterns.

## Tables (the row language)

Header chrome is encoded globally (`.dashboard-main .table thead th`): uppercase 12px
semibold, `/50` muted, hairline divider. Never style `<th>` per page. Rows follow one
vocabulary — same meaning, same shape; different data, different cells:

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
- [ ] Icons via `<app-icon>`; zero inline `<svg>`; zero emoji.
- [ ] Pages composed via `<app-page>`; forms via `<app-form-field>`; actions via `appButton`; money via `<app-money>`.
- [ ] Modals via the shared shell (`.modal-box`, full-screen on mobile).
- [ ] Task modals use `.modal-box-task` + one `.modal-body`; short/read-only dialogs use `.modal-box-scroll`; no consumer-owned viewport sizing or overflow.
- [ ] Loading, empty, and error states present; touch targets ≥ 44px; phone layout first.
