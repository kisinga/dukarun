# UI/UX Design Principles — Field Guide

A portable, framework-agnostic checklist of the fundamentals. Distilled from core
UI/UX design principles into rules you can apply on **any** project (web, mobile,
dashboard, marketing). No stack assumed — map each rule to your own tokens/utilities.

> The one-line philosophy: **good UI communicates function without instructions.**
> If a user needs a manual to know what's clickable, what's selected, or what's most
> important, the design is doing the work the interface should do.

---

## 1. Signifiers — let the UI explain itself

A *signifier* is a visual cue that tells the user how something works or relates,
with no written explanation.

- **Grouping** — a container around related items says "these belong together" (and, by
  omission, that others don't).
- **Selection** — a highlighted / filled / toggled container says "this is active"; the
  user infers they can toggle to the others.
- **Disabled** — greyed-out says "inactive, clicking does nothing."
- Also: button press states, active nav highlights, hover states, tooltips, focus rings.

**Rule:** build signifiers in. Never rely on instructions to explain an interaction that
a state, container, or icon could convey on its own.

## 2. Visual hierarchy — rank, then express the rank

Bad hierarchy looks like a spreadsheet: everything the same weight, nothing important.
You have four levers:

- **Size** — the most important thing is the largest/boldest; supporting detail is smaller.
- **Position** — most important goes near the top / first in reading order.
- **Colour** — one element in a different colour draws the eye (e.g. a price, top-right,
  in an accent colour). Use rarely so it stays special.
- **Images/icons** — an image adds a colour pop and makes scanning easy; an icon can
  *replace* words (two location pins instead of "from / to").

**Contrast is the mechanism.** Big-vs-small and colourful-vs-muted *is* the hierarchy.
If nothing contrasts, nothing reads as important.

## 3. Layout — white space over grids

- Grids (12-column, etc.) are **guidelines, not laws.** Custom / hero layouts routinely
  ignore them. Grids earn their keep on **repeating, structured content** (galleries,
  tables, feeds) where they drive responsive behaviour (e.g. 12 → 8 on tablet → 4 on mobile).
- **White space matters more than the grid.** Let things breathe. Generous space between
  distinct sections; tight space within a group. Grouping-by-proximity is itself hierarchy.
- **4-point spacing system:** make every gap a multiple of 4. Not because 4 is magic, but
  because you can always halve it — which keeps spacing consistent across the whole product.

## 4. Typography — one font, tuned well

- **One sans-serif family is almost always enough.** Don't spend time here; pick a clean
  typeface and commit. Multiple fonts read as amateur.
- **Tighten large text.** Big headings look loose by default — pull letter-spacing to
  about **−2% to −3%** and line-height to **110–120%**. This one adjustment makes large
  type look instantly professional.
- **Size range depends on density:**
  - Landing pages / marketing: a wide range, up to ~6 sizes.
  - **Dashboards / dense info: compress hard — generally no text larger than ~24px**,
    because information density is high.

## 5. Colour — start with one, add meaning

- **Start from a single primary/brand colour.** Lighten it for backgrounds, darken it for
  text — subtle ways to make a drab design interesting. Extend into a full *ramp* (tints/
  shades) for chips, states, charts.
- **Semantic colours carry meaning, not decoration:**
  - **Blue** — trust / neutral emphasis
  - **Red** — danger / urgency / destructive
  - **Yellow/amber** — warning / caution
  - **Green** — success / positive
- **Rule:** use colour for *purpose*, not decoration. A red number must mean "bad." If
  colour isn't communicating meaning, it's noise.

## 6. Icons & buttons

- **Size icons to the adjacent text's line-height** (e.g. 24px text → 24px icon), then
  tighten the text. Most icons are used too large.
- **Sidebar / nav links are "ghost buttons"** — no background until hover.
- **Button padding heuristic: horizontal padding ≈ 2× the vertical** (roughly width = 2×
  height of the padding box). Don't cramp buttons.
- Icons on buttons are optional — use them when they add clarity.

## 7. Feedback — every action gets a response

If the user does anything, the UI must respond. Silent interfaces feel broken.

- **Buttons: at least 4 states** — default, hover, active/pressed, disabled — plus a
  **loading** state (spinner) for async actions.
- **Inputs: focus** on click-in, **error** (red border + message) when invalid, and
  optional **warning** for soft issues.
- Everywhere: loading spinners while fetching, success confirmation on completion, empty
  states when there's nothing to show.

## 8. Micro-interactions — feedback with polish

A micro-interaction is feedback that goes a step further to confirm and delight. Example:
a "copy" button that not only changes on click but slides a little "Copied!" chip up so
the user *knows* it worked. Range from purely functional to playful. Use where they add
clarity; don't overdo it.

## 9. Depth — shadows (light) & layering (dark)

- **Light mode — shadows are subtle.** Default shadows are usually too strong: **lower the
  opacity, raise the blur.** Strength scales with elevation — a card needs very little; a
  popover/menu that floats above content needs more. Inner+outer shadows can make a control
  look raised/tactile. **If the shadow is the first thing you notice, you've overdone it.**
- **Dark mode — don't rely on shadows for depth.** Instead make the **card lighter than the
  background.** Soften light borders (they over-contrast on dark). Dim the saturation and
  brightness of chips/accents, and flip foreground/background to keep hierarchy. Dark mode
  frees you to use deep purples, reds, greens — not just navy and grey.

## 10. Overlays — protect the image *and* the text

When text sits over an image, a flat full-screen overlay ruins the image. Instead:

- Use a **linear gradient** that keeps the image visible where it matters and fades into a
  solid, text-readable area where the text sits.
- For a more modern look, add a **progressive blur** on top of the gradient.

---

## Quick review checklist

- [ ] Can a first-time user tell what's clickable, selected, and disabled — without labels?
- [ ] Is there a clear #1 element (size + position + colour), or does it read like a table?
- [ ] Is spacing on a 4-pt system; do sections breathe and groups cohere?
- [ ] One font; large headings tightened (−2/−3% tracking, 110–120% line-height)?
- [ ] Dense screens capped at ~24px type?
- [ ] One primary colour + a ramp; semantic colours used only for meaning?
- [ ] Icons sized to line-height; nav links are ghost buttons?
- [ ] Every interactive element has hover + disabled (+ loading/focus/error where relevant)?
- [ ] Shadows subtle in light mode; depth via lighter surfaces in dark mode?
- [ ] Image-over-text uses a gradient (and maybe progressive blur), never a flat overlay?

---

*Adapting to your stack:* map "4-pt spacing" to your spacing scale, "semantic colours" to
your theme tokens, and "≤24px on dense screens" to your type ramp. The principles are
constant; only the tokens change.
