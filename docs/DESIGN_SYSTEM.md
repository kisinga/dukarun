# Dukahub Design System

**North star:** every UI/UX decision in the dashboard is grounded in the design-principles
video (`/Users/mac/Documents/personal/videoplayback.mp4`). This file is the durable
translation of that video into concrete, enforceable rules for this codebase
(Angular 21 + Tailwind v4 `@theme` + daisyUI). When a design choice is ambiguous, this
file — and the video behind it — decides.

Context that shapes every rule: **Dukahub is a dashboard/POS app used on shop phones.**
So two constraints dominate — **information density** (dashboard, not landing page) and
**mobile-first** (design the small screen first, never as an afterthought).

---

## 1. Visual hierarchy (video: "size, position, colour, images")

Rank every surface's information, then express the rank with:
- **Size** — the most important value is the largest/boldest; secondary info is smaller and below.
- **Position** — most important near the top; primary numbers before supporting detail.
- **Colour** — a different colour draws the eye (the video's example: price is top, right-aligned, and a distinct colour). Use sparingly and with meaning (§4).
- **Icons over words** — replace labels with icons where an icon is unambiguous (the video replaces "from/to" with location pins; we replace `Email:`/`Phone:` labels with mail/phone icons).
- **Contrast makes hierarchy** — big-vs-small and colourful-vs-muted *are* the hierarchy. If everything is the same weight, nothing reads as important (the "spreadsheet, not a design" failure).

Applied: a stat/KPI leads with the **number** (large, bold), the label is smaller and muted above/below, and only the number that needs attention (overdue, error) gets semantic colour.

**Enrichment must be signal, not filler.** A stat card's optional secondary (`delta`/`hint`) exists to surface the single **most important** supporting fact — an actionable number (e.g. "3 overdue") or a real trend (e.g. "+12 this week", "▼ 8% vs last month"). Never add a derived-but-obvious value ("26% of total") or a restated label ("needs review") just to fill the card or make it look busy — that is garbage for the sake of UI. If a stat has no important secondary fact, leave it as label + value; the icon chip + colour already give it life.

## 2. Type scale — dashboard density (video: "no text larger than 24px" for dense info)

- **Never exceed ~24px (`text-2xl`) in dashboard surfaces.** Landing/marketing pages may use a large range and up to 6 sizes; dashboards must compress.
- One sans-serif family only (already `DM Sans` in this app). Never introduce a second font.
- **Tighten large text:** headers ≥ `text-xl` get `tracking-tight` (≈ −2/−3% letter-spacing) and `leading-tight`/`leading-snug` (110–120% line-height). Never leave big text loose.
- Concrete ladder for dashboards (map to Tailwind):
  - Page title: `text-xl font-bold tracking-tight` (≤ `text-2xl`).
  - Stat/hero number: `text-2xl font-bold tracking-tight leading-tight`.
  - Section heading: `text-sm font-semibold`.
  - Body/value: `text-sm`.
  - Label/caption: `text-xs text-base-content/60`.
- **Kill arbitrary micro sizes** (`text-[10px]`, `text-[11px]`). Use `text-xs`; add one 2xs token only if genuinely needed.

## 3. Spacing — 4-point system (video: "everything is a multiple… you can always split in half")

- All spacing is a multiple of 4px → Tailwind steps `1,1.5,2,3,4,6,8` (4/6/8/12/16/24/32px). No arbitrary `px-[13px]`.
- **White space over grids.** Grids (12-col) are guidelines, not law; prioritise breathing room and *grouping related elements* (a form of hierarchy). ~`gap-8`/`space-y-8` (32px) between distinct sections; tighter (`gap-2`/`gap-3`) within a group.
- Group elements that belong together (title+subtitle, label+value) with small gaps; separate unrelated groups with large gaps.

## 4. Colour — one primary + semantic (video: "colour for purpose, not decoration")

- Start from the **primary/brand** colour; lighten for backgrounds, darken for text. daisyUI already gives us the ramp (`primary`, `primary-content`, `base-100/200/300`, `base-content`).
- **Semantic colours are reserved for meaning:**
  - `success` (green) — completed, paid, positive balance, approved.
  - `error` (red) — danger/urgency, overdue, failed, destructive.
  - `warning` (yellow/amber) — needs attention, pending-risk.
  - `info`/primary (blue) — trust, neutral emphasis, links.
- Never use a semantic colour decoratively. A red number must mean "bad"; a green number must mean "good". (Respect existing domain sign conventions when wiring this — e.g. the customer/supplier outstanding convention.)
- Muted text uses opacity on `base-content` (`/80`, `/70`, `/60`, `/55`) — a controlled ramp, not ad-hoc greys.

## 5. Signifiers & interaction states (video: "every action needs a response")

- **Signifiers:** containers group related items; a highlighted/toggled container = selected; greyed-out = inactive/disabled; active nav items are highlighted; hover states + tooltips tell the user what an element affords. Build these in, don't rely on instructions.
- **Buttons: minimum 4 states** — default, hover, active/pressed, disabled — plus **loading** (spinner) where an action is async. daisyUI `btn` gives most; ensure disabled + loading are actually wired for async actions.
- **Inputs:** focus state on click-in, **error** (red border + message), optional **warning**. Never fail silently.
- **Feedback everywhere:** loading spinners while fetching, success confirmation on completion, empty states when there's no data.
- **Micro-interactions** confirm actions with a little delight (e.g. a chip sliding up to confirm "copied"). Use where it adds clarity, not noise.

## 6. Icons (video: "icon size = font line-height", ghost sidebar, padding 2×height)

- Icon system = **@ng-icons/heroicons (outline)**. Register in `frontend/src/app/core/icons/app-icons.ts`; use `<ng-icon name="heroWallet">`. No emoji, no ad-hoc inline `<svg>`. (See memory `icon-system-ngicons`.)
- **Size icons to the adjacent text's line-height** (the video's core icon rule). Inline-with-`text-sm` → ~16px (`size="1rem"`, our default); inline-with-`text-xs` → ~14px (`size="0.875rem"`). Then tighten text next to it.
- **Sidebar links are ghost buttons** — no background until hover.
- **Button padding guideline: width = 2 × height** (roughly what daisyUI `btn` already does; respect it, don't cramp).

## 7. Depth — shadows (light) & layering (dark) (video)

- **Light mode:** shadows are *subtle*. Reduce opacity, increase blur. Cards → light shadow; popovers/menus/modals → stronger. Inner+outer shadows only for deliberately raised/tactile controls. **"If the shadow is the first thing you notice, it's wrong."** Standardise on one soft card shadow (`shadow-sm` + a hairline `border border-base-300/60`), reserve heavier shadows for overlays.
- **Dark mode:** don't lean on shadows for depth — make the **card lighter than the background** instead. Soften light borders (they over-contrast). Dim chip saturation/brightness and flip fg/bg for hierarchy.

## 8. Surfaces & cards

- One card recipe: `rounded-box border border-base-300/60 bg-base-100` + subtle shadow. No competing shadow levels, no boxes-nested-in-boxes (a bordered card inside a bordered card is banned — use dividers/spacing instead).
- Flatten chrome to one surface level; primary info visible at a glance (no accordion hiding the key number).

## 9. Overlays (video)

- Never let a full flat overlay kill an image. Use a **linear gradient** that fades the image into a text-readable area; add a **progressive blur** on top of the gradient for a modern look. Applies to any image-with-text (marketing hero, product cards with captions).

## 10. Mobile-first (project constraint — memory `feedback-mobile-first`)

- Design the phone layout first. Touch targets ≥ ~44px. Full-screen modals on mobile (`h-full max-h-screen md:h-auto md:max-h-[90vh]`).
- **Stats/KPIs on mobile:** a horizontally-scrollable or stacked strip — never a cramped multi-column grid that truncates the number. The number stays legible.
- Primary actions are thumb-reachable (bottom on mobile).

---

## Enforcement checklist (use in review)

- [ ] No dashboard text > `text-2xl` (24px); large headers are `tracking-tight leading-tight`.
- [ ] Spacing is 4-pt (no arbitrary px); related items grouped, sections breathe.
- [ ] Semantic colour only where it means something; muted text via `base-content/xx`.
- [ ] Every interactive element has hover + disabled (+ loading/focus/error where relevant).
- [ ] Icons via `<ng-icon>`, sized to line-height; zero emoji; zero ad-hoc inline `<svg>`.
- [ ] One card recipe; subtle shadow; no nested bordered boxes.
- [ ] Primary number/value visible without expanding; clear hierarchy (size/position/colour).
- [ ] Mobile layout designed first; KPIs legible on a phone; targets ≥44px.
