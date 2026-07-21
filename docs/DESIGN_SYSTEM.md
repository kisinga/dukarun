# Dukarun Design Language — "The Counter"

This document is the normative spec for all Dukarun dashboard UI. It is short on purpose:
the real enforcement lives in code — tokens in `frontend/src/styles.scss` (`@theme`), shared
components in `frontend/src/app/shared/`, and the `design-guard` CI gate
(`frontend/scripts/design-guard.mjs`). If this doc and the code disagree, **the code is
wrong** — fix the code or update this doc in the same PR.

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

Dashboard text never exceeds 24px. Use these roles (Tailwind classes shown):

| Role | Classes | Use |
|---|---|---|
| `hero` | `text-2xl font-bold tracking-tight tabular-nums` | Stat numbers, totals |
| `title` | `text-xl font-bold tracking-tight` | Page titles only (via `PageHeaderComponent`) |
| `heading` | `text-sm font-semibold` | Section headings |
| `body` | `text-sm` | Values, rows |
| `caption` | `text-xs text-base-content/60` | Labels, timestamps |

- No arbitrary sizes (`text-[10px]`, `text-[11px]`) — the guard rejects them.
- Marketing pages (`home`, `pricing`, `features`, `about`, `contact`, auth) have their own
  scale in `frontend/src/styles/_marketing.scss`; this scale governs the dashboard.

## Spacing

- 4-point system: Tailwind steps `1, 1.5, 2, 3, 4, 6, 8`. No arbitrary px spacing.
- Page content lives in the standard `dashboard-main` wrapper — pages add only vertical
  rhythm: `space-y-6` between sections, `gap-2`/`gap-3` within a group. Do not nest
  `container-app` inside dashboard pages.

## Icons

- System: `@ng-icons/heroicons` (outline), registered in
  `frontend/src/app/shared/icons/app-icons.ts`. Use `<ng-icon name="hero…">`.
- **No inline `<svg>`, no emoji, ever** — the guard rejects them. Add missing icons to the
  registry.
- Sizes: use the `AppIconComponent` wrapper — `sm` (14px, with `text-xs`), `md` (16px, with
  `text-sm`, the default), `lg` (20px, standalone), `xl` (40px, decorative only: empty states
  and large placeholders). No other values.

## Depth & colour tokens

- Two shadows, defined in `@theme`: card (subtle) and overlay (strong). Nothing else.
- Radius: `--radius-box` for cards, `--radius-field` for inputs/buttons, `--radius-selector`
  for chips/toggles. No `rounded-xl/2xl/3xl` on cards.
- Colours come from the daisyUI theme only. No hardcoded hex in component styles.

## The List Page (canonical layout)

Every list page is the same four blocks, top to bottom — no improvisation:

1. **`<app-page-header>`** — title (+ subtitle). Stats strip in the `[header-stats]` slot via a
   per-domain `*-stats` wrapper over `app-stat-bar` (pills; tones are money-meaning only —
   neutral totals, warning/error for states that need action; the bar's zero-guard handles
   the rest, wrappers don't re-implement it). **The create action lives in the `[actions]`
   slot**: one `btn btn-primary btn-sm gap-2` with a `heroPlus` icon ("Add Customer",
   "Record Adjustment"…). Never in the table footer, never a bare floating row.
2. **`<app-list-search-bar>`** — search input + `[badges]` + `[filters]` slots. No custom
   search rows, no bare `input-bordered`.
3. **Data surface** — desktop: `card` (global recipe) containing `table table-zebra` with
   row-click navigation to the detail view (no "View" buttons); mobile: a per-domain card
   component. Empty state = `<app-empty-state>`.
4. **`<app-pagination>`** — the shared component. No hand-rolled `join` pagination.

Pages without countable state may omit stats (rare); pages whose entities originate
elsewhere (orders from the POS) omit the create action.

**Trend/insight cards** — any time-series or analytics panel on a list page uses
`<app-trend-card>` (shared/components/dashboard/trend-card.component.ts): collapsible,
lazy-loaded, `type-heading` title, hairline divider, standard card recipe. One per page,
between the header and the search bar. Never hand-roll the collapse chrome.

## Navigation chrome (sidebar / bottom nav)

One recipe, encoded in `styles.scss`: `.nav-item` (sidebar links, drawer links, footer
links) and `.bottom-nav-item` (mobile tab bar). Ghost by default, 4pt rhythm, 44px
targets, icons inherit state color. Exactly **one active signifier**: the tinted
container (`.nav-item-active` / the icon pill in `.bottom-nav-active`) — no indicator
bars, dots, gradients, or weight games on top of it. Apply the active class via
`routerLinkActive`. Never hand-roll nav rows in shell files.

## Enforcement checklist (review + `npm run design-guard`)

- [ ] No dashboard text > `text-2xl`; titles/hero numbers are `tracking-tight`; amounts are `tabular-nums`.
- [ ] One card recipe; no nested bordered boxes; heavy shadows only on overlays.
- [ ] Semantic colour only with money meaning; muted text via `base-content/xx`.
- [ ] Icons via `AppIconComponent`/`<ng-icon>`; zero inline `<svg>`; zero emoji.
- [ ] Page titles via `PageHeaderComponent`; modals via the shared shell (full-screen on mobile).
- [ ] Loading, empty, and error states present; touch targets ≥ 44px; phone layout first.
