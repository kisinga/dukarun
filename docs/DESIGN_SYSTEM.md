# Dukarun Design Language — "The Counter"

This document is the normative spec for all Dukarun dashboard UI. It is short on purpose:
the real enforcement lives in code — tokens in `apps/web/src/styles.scss` (`@theme` + global
recipes), shared components in `apps/web/src/app/shared/ui/`, and the `design-guard` CI gate
(`apps/web/scripts/design-guard.mjs`, run via `npm run design-guard` in `apps/web`). The legacy
`frontend/` app follows the same language with its own guard. If this doc and the code
disagree, **the code is wrong** — fix the code or update this doc in the same PR.

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

One primary action per screen, thumb-reachable.

- Touch targets ≥ 44px; the primary action is bottom-anchored on mobile.
- Modals are full-screen on phones — encoded globally on `.modal-box` in `styles.scss`
  (`h-full` on mobile, `md:h-auto md:max-h-[90vh]` on desktop). Don't add your own
  height handling; per-modal width via `md:max-w-*` only.
- Transitions are 150–200ms, no ornamental animation in dashboard flows.
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

---

## Type scale — 5 roles (dashboard)

Dashboard text never exceeds 24px. The roles are encoded as Tailwind utilities in
`apps/web/src/styles.scss` — use them, not raw size classes:

| Role | Utility | Use |
|---|---|---|
| `hero` | `type-hero` (24px bold, `tracking-tight`, `tabular-nums`) | Stat numbers, totals |
| `title` | `type-title` (20px bold tight) | Page titles only (via `PageHeaderComponent`) |
| `heading` | `type-heading` / `.section-title` (14px semibold) | Section headings |
| `body` | `type-body` (14px) | Values, rows |
| `caption` | `type-caption` (12px, `/60` muted) | Labels, timestamps |

- No arbitrary sizes (`text-[10px]`, `text-[11px]`) — the guard rejects them.
- Marketing pages in the legacy `frontend/` app have their own scale
  (`frontend/src/styles/_marketing.scss`); this scale governs the dashboard.

## Spacing

- 4-point system: Tailwind steps `1, 1.5, 2, 3, 4, 6, 8`. No arbitrary px spacing.
- Page content lives in `<app-page>` (`PageLayoutComponent`), which owns the
  `dashboard-main` + `.page` wrapper — pages add only vertical rhythm: `space-y-6`
  between sections, `gap-2`/`gap-3` within a group. Never hand-roll the
  `dashboard-main`/`.page` boilerplate in a page template.

## Icons

- System: `@ng-icons/heroicons` (outline), registered via `provideIcons()` in
  `apps/web/src/app/app.config.ts`. Add missing icons to that registry.
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
- **`<button appButton>`** — one button idiom: `variant="primary|outline|ghost|error"`,
  `size="sm|md"`, `[loading]` swaps in a spinner and disables. No raw `btn btn-*` strings
  for standard actions (tight table-row clusters may stay raw by exception).
- **`<app-money [cents]>`** — the only way to render money: tabular-nums KES formatting,
  `direction="in|out"` for money-meaning colour, `masked` for hidden figures. Never
  `{{ formatKes(...) }}` in templates (string composition in TS, e.g. option labels, is fine).
- **`<app-icon>`** — icons on the 4-size scale (see Icons).
- Plus the existing shells: `app-page-header` (inside `app-page`), `app-stat-bar`,
  `app-stat-card`, `app-status-badge`, `app-empty-state`, `app-list-search-bar`,
  `app-pagination`, `app-entity-avatar`, `app-mobile-fab`, `app-delete-confirmation-modal`.

Global recipes in `styles.scss` complement them: `.card`, `.form-field` (used by
`app-form-field`), `.section-title`, `.modal-box`, `.nav-item`, table header chrome.

## The List Page (canonical layout)

Every list page is the same four blocks, top to bottom — no improvisation:

1. **`<app-page title="…">`** — the shell + header. Stats strip via `app-stat-bar` pills
   (tones are money-meaning only — neutral totals, warning/error for states that need
   action; the bar's zero-guard handles the rest). **The create action lives in the
   `[actions]` slot**: one `<button appButton>` with a `heroPlus` icon ("Add Customer",
   "Record Adjustment"…). Never in the table footer, never a bare floating row.
2. **`<app-list-search-bar>`** — search input + `[badges]` + `[filters]` slots. No custom
   search rows, no bare `input-bordered`.
3. **Data surface** — desktop: `card` (global recipe) containing `table table-zebra` with
   row-click navigation to the detail view (no "View" buttons); mobile: a per-domain card
   component. Empty state = `<app-empty-state>`.
4. **`<app-pagination>`** — the shared component. No hand-rolled `join` pagination.

Pages without countable state may omit stats (rare); pages whose entities originate
elsewhere (orders from the POS) omit the create action.

**Trend/insight cards** — the legacy app used a collapsible `<app-trend-card>` for analytics
panels on list pages; it has not been ported to `apps/web` yet. Until it is, keep analytics
panels in a standard `card` with a `.section-title` heading, one per page, between the
header and the search bar.

## Navigation chrome (sidebar / bottom nav)

One recipe, encoded in `styles.scss`: `.nav-item` (sidebar links, drawer links, footer
links) and `.bottom-nav-item` (mobile tab bar). Ghost by default, 4pt rhythm, 44px
targets, icons inherit state color. Exactly **one active signifier**: the tinted
container (`.nav-item-active` / the icon pill in `.bottom-nav-active`) — no indicator
bars, dots, gradients, or weight games on top of it. Apply the active class via
`routerLinkActive`. Never hand-roll nav rows in shell files.

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
- **Expanded detail rows** (line items, reconciliations): one `tr.row-detail` with a
  single full-width `td` (inset surface is encoded). No second zebra inside, no nested
  bordered boxes.

## Enforcement checklist (review + `npm run design-guard` in `apps/web`)

- [ ] No dashboard text > `text-2xl`; titles/hero numbers are `tracking-tight`; amounts are `tabular-nums`.
- [ ] One card recipe; no nested bordered boxes; heavy shadows only on overlays.
- [ ] Semantic colour only with money meaning; muted text via `base-content/xx`.
- [ ] Icons via `<app-icon>`; zero inline `<svg>`; zero emoji.
- [ ] Pages composed via `<app-page>`; forms via `<app-form-field>`; actions via `<button appButton>`; money via `<app-money>`.
- [ ] Modals via the shared shell (`.modal-box`, full-screen on mobile).
- [ ] Loading, empty, and error states present; touch targets ≥ 44px; phone layout first.
