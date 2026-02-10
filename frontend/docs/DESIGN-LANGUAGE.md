# Design Language

**How we decide.** Short, principle-based. For details and examples see [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md).

---

## Principles

1. **Mobile-first** — Default for phones; enhance for tablet/desktop.
2. **One spacing scale** — 4px base. Use only scale values (no arbitrary gaps/padding).
3. **Touch targets >= 44px** — Buttons and list rows meet `min-h-[2.75rem]` on mobile.
4. **Primary = one main action** — One primary CTA per context; ghost/outline for secondary.
5. **Motion supports** — Fast feedback (hover/active); entry for panels. No decoration.
6. **Data-first** — Numbers and metrics are prominent. Labels are secondary/muted.
7. **No decoration** — No emojis, no gradients, no bouncy effects. Clean borders, semantic colors.
8. **Desktop-constrained** — Content areas use `max-w-5xl` or similar to prevent meaningless stretching.

---

## Tokens

| Area | Use only | Tailwind / daisyUI |
|------|----------|--------------------|
| **Spacing (gap/padding)** | 8px, 12px, 16px, 24px, 32px | `gap-2` (8), `gap-3` (12), `gap-4` (16), `gap-6` (24), `gap-8` (32). `p-4`, `p-6`, etc. |
| **Radius** | Cards, list rows | `rounded-lg` |
| **Radius** | Modals, dropdowns, overlays | `rounded-xl` |
| **Radius** | Small controls | `rounded-md` or `rounded-lg` |
| **Motion** | Hover, active, toggles | 150-200ms; easing `cubic-bezier(0.4, 0, 0.2, 1)` |
| **Motion** | Panel/modal entry | 200-300ms; same easing |
| **Colors** | Backgrounds, text, borders | daisyUI semantic: `bg-base-100`, `text-base-content`, `border-base-300`, `btn-primary`, etc. |

---

## Components (rules)

- **Buttons**
  Primary = main CTA only. Ghost = secondary; outline when needed.
  Size: `btn-sm` for toolbar/table; `btn` or `btn-lg` for page CTAs.
  Mobile: ensure `min-h-[2.75rem]` (or touch-target utility) for tap targets.

- **Cards**
  daisyUI `card`; inner padding `p-4` mobile, `sm:p-6` desktop. Border from theme (`border-base-300`). No ad-hoc shadows. Optional: use class `.card-standard` (from `_design-patterns.scss`) for the canonical pattern.

- **Stat cards**
  Subtle tinted background per category (`oklch(var(--color) / 0.04)`) with colored left accent border (`border-l-4`).
  Label: `text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-base-content/50`.
  Value: `text-lg sm:text-xl lg:text-2xl font-bold tabular-nums text-{color}`.
  Category colors: Sales = `success` (green), Purchases = `info` (blue), Expenses = `error` (red).
  Hover intensifies tint to `0.07`. Click to expand breakdown. Use `.stat-card-{type}` classes.
  Layout: `grid-cols-3` always (compact 3-column even on mobile).

- **Period selector**
  Tab bar above stat cards. Switches which period (Today / This week / This month) is shown prominently.
  Uses the standard Tabs pattern: `bg-base-200 rounded-lg` wrapper, `tabs tabs-box` inside.

- **Breakdowns**
  Expandable list below stat cards. Each row: first-letter badge + label + value.
  Badge: `w-7 h-7 rounded-lg text-[10px] font-bold bg-{color}/10 text-{color}`.
  No emojis. Use first letter of account label for the badge.

- **Quick stats**
  Inline text row, not cards. `Products: 42 . Users: 1 . Avg sale: KES 1,200`.
  Bold value, muted label. No boxes needed for secondary metrics.

- **Tabs**
  One pattern app-wide: wrapper with `bg-base-200 rounded-lg overflow-x-auto`; inside `role="tablist" class="tabs tabs-box"`. Active: `tab-active` (theme primary).

- **Icons**
  One size per context: nav/sidebar = 20px (`h-5 w-5`); inline with text = 16px (`h-4 w-4`); feature/empty state = 24px (`h-6 w-6`). Single set (stroke, 24 viewBox). Prefer shared component or SVGs.

- **Lists / rows**
  Structure: icon/avatar + content + optional action. Padding and gap from scale. `rounded-lg`. Hover/active: `bg-base-200` (or theme equivalent).

- **Dashboard layout (sidebar + top nav)**
  Top navbar: `bg-base-100`. Sidebar: **solid** `bg-base-100` (opaque panel; mobile drawer must not look transparent). Overlay when drawer is open: `bg-base-content/50 backdrop-blur-md`. Sidebar uses `shadow-2xl` and `border-r border-base-300` for depth. Both share `min-h-16` so the sidebar header aligns with the top nav. Logo: `2rem` height, `px-4` horizontal padding. Sidebar nav icons use `bg-base-100` containers.

- **Page header cards**
  Top section of dashboard pages wraps in `bg-base-100 rounded-lg border border-base-300 p-4 sm:p-5`.
  Title: `text-2xl sm:text-3xl font-bold tracking-tight`. Stacks `flex-col` on mobile, `flex-row` on `sm:`.
  Status badges (e.g. shift Open/Closed) sit with action buttons, not with the title/date.

---

## Dashboard Category Colors

| Category | Color | daisyUI variable | Use for |
|----------|-------|------------------|---------|
| Sales | success (green) | `--su` | Revenue, income |
| Purchases | info (blue) | `--in` | Stock purchases, neutral transactions |
| Expenses | error (red) | `--er` | Operating expenses, costs |

---

## Relationships

- **Hierarchy:** Page title -> section title -> card/list -> controls.
- **Vertical rhythm:** Spacing between sections (`space-y-6`) > spacing inside cards (`p-4`).
- **Nesting:** Use semantic containers (card, list, section) so structure is predictable.

---

## Do / Don't

- **Do** use design-system tokens in SCSS (`ds.$space-4`, `ds.$transition-base`).
- **Do** use daisyUI semantic classes (`btn-primary`, `bg-base-200`, `text-base-content`).
- **Do** constrain content width on desktop (`max-w-5xl`).
- **Do** use first-letter badges instead of emojis for account/category indicators.
- **Do** show secondary metrics as inline text, not oversized card grids.
- **Don't** add new arbitrary `rounded-*` or `shadow-*` values; use tokens.
- **Don't** use inline styles for layout or spacing; use Tailwind/design scale.
- **Don't** introduce new tab or card patterns; use the one defined above.
- **Do** use subtle tinted backgrounds for category cards (`oklch(var(--color) / 0.04)`).
- **Don't** use emojis, heavy gradient backgrounds, or `active:scale-*` press effects.
- **Don't** use "Soon" or placeholder badges for unimplemented features in production views.
