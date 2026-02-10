# DukaRun Design System

**Mobile-First. Simple. Consistent.**

**Decisions follow [Design Language](docs/DESIGN-LANGUAGE.md)** — principles, tokens, and component rules. This doc is the detailed reference (examples, snippets, patterns).

---

## 🚀 Quick Start

### Import in Component SCSS:

```scss
@use '../../../../styles/design-system' as ds;

.my-card {
  padding: ds.$space-4;

  @include ds.tablet {
    padding: ds.$space-6;
  }
}
```

### Use in Templates:

```html
<div class="card bg-base-100 p-4 sm:p-6">
  <h2 class="text-2xl sm:text-3xl font-bold">Title</h2>
  <button class="btn btn-primary btn-lg min-h-[3rem]">Action</button>
</div>
```

---

## 📏 The 3 Rules

### 1️⃣ Mobile First

```scss
// ✅ Start with mobile, enhance for desktop
.button {
  font-size: 14px; // Mobile default

  @media (min-width: 640px) {
    font-size: 16px; // Tablet+
  }
}
```

### 2️⃣ Use Spacing Scale (4px base)

```scss
gap: 8px; // ds.$space-2
padding: 12px; // ds.$space-3
margin: 16px; // ds.$space-4
```

### 3️⃣ Touch Targets ≥ 44px

```html
<button class="btn btn-lg min-h-[3rem]">Touch Friendly</button>
```

---

## 📐 Spacing Scale

| Name        | Size | Use For           |
| ----------- | ---- | ----------------- |
| `$space-1`  | 4px  | Tiny gaps         |
| `$space-2`  | 8px  | Small gaps, icons |
| `$space-3`  | 12px | Mobile padding    |
| `$space-4`  | 16px | Default spacing   |
| `$space-6`  | 24px | Section spacing   |
| `$space-8`  | 32px | Large spacing     |
| `$space-12` | 48px | Desktop sections  |

**HTML Usage:**

```html
<div class="p-3 sm:p-4 lg:p-6">
  <div class="flex gap-2 sm:gap-4">Items</div>
</div>
```

---

## ✏️ Typography

### Font Sizes:

```
xs:   10px - Timestamps, tiny labels
sm:   12px - Labels, captions
base: 14px - Body (mobile)
lg:   16px - Body (desktop)
xl:   18px - Subheadings
2xl:  20px - Headings (mobile)
3xl:  24px - Headings (desktop)
4xl:  30px - Page titles (mobile)
5xl:  36px - Page titles (desktop)
```

### Weights:

```
400 - normal
500 - medium
600 - semibold
700 - bold
```

### Usage:

```html
<h1 class="text-4xl sm:text-5xl font-bold">Page Title</h1>
<p class="text-sm sm:text-base">Body text</p>
<div class="text-xs opacity-60">Caption</div>
```

### Numbers (Always Tabular):

```html
<div class="text-tabular font-bold">$1,234.56</div>
```

---

## 🎨 Colors (daisyUI Theme)

```scss
// Backgrounds
oklch(var(--b1))  // Main background
oklch(var(--b2))  // Cards/elevated
oklch(var(--b3))  // Borders

// Text
oklch(var(--bc))  // Body text

// Semantic
oklch(var(--p))   // Primary (blue)
oklch(var(--su))  // Success (green)
oklch(var(--er))  // Error (red)
oklch(var(--wa))  // Warning (yellow)

// With opacity
oklch(var(--p) / 0.1)   // 10% opacity
oklch(var(--su) / 0.3)  // 30% opacity
```

**HTML Usage:**

```html
<div class="bg-base-100 text-base-content">
  <span class="text-primary">Blue text</span>
  <span class="text-success">Green text</span>
</div>
```

---

## 📱 Breakpoints

```scss
Mobile:  0-639px   (default)
Tablet:  640px+    (sm:)
Desktop: 1024px+   (lg:)
Wide:    1280px+   (xl:)
```

### Responsive Mixins:

```scss
@include ds.tablet {
} // 640px+
@include ds.desktop {
} // 1024px+
@include ds.wide {
} // 1280px+
```

---

## 🔲 Common Patterns

### Card:

```html
<div class="card bg-base-100 shadow-lg border-2 border-base-300">
  <div class="card-body p-4 sm:p-6">
    <h3 class="font-bold text-lg">Title</h3>
    <p>Content</p>
  </div>
</div>
```

### Button:

```html
<button class="btn btn-primary btn-lg min-h-[3rem]">Action</button>
```

### List Item:

```html
<button class="w-full flex items-center gap-3 p-4 rounded-lg bg-base-200 hover:bg-base-300">
  <div class="flex-1 text-left">
    <div class="font-semibold">Name</div>
    <div class="text-xs opacity-60">Details</div>
  </div>
  <div class="text-lg font-bold text-tabular">$12.34</div>
</button>
```

### Collapsible:

```html
<div class="card bg-base-100 shadow-lg">
  <div class="collapse collapse-arrow">
    <input type="checkbox" />
    <div class="collapse-title min-h-[3.5rem] flex items-center gap-3">
      <h3 class="font-bold">Section</h3>
    </div>
    <div class="collapse-content p-4">Content</div>
  </div>
</div>
```

### Bottom Sheet Modal:

```html
<div class="modal modal-open modal-bottom sm:modal-middle">
  <div class="modal-box max-w-xl">
    <!-- Slides up on mobile, centered on desktop -->
  </div>
  <div class="modal-backdrop" (click)="close()"></div>
</div>
```

### Sticky Bottom Bar:

```html
<div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t-2 border-base-300 z-40">
  <div class="container-app py-3">
    <button class="btn btn-success btn-block btn-lg">Action</button>
  </div>
</div>
```

### Empty State:

```html
<div class="text-center py-16">
  <div class="text-5xl mb-3">🔍</div>
  <p class="font-semibold">No results</p>
  <p class="text-sm opacity-60 mt-2">Description</p>
</div>
```

---

## 🎯 Responsive Grid Patterns

```html
<!-- 1 → 3 columns -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <!-- 2 → 4 columns -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
    <!-- 3 columns always (compact) -->
    <div class="grid grid-cols-3 gap-2">
      <!-- Auto-fit -->
      <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4"></div>
    </div>
  </div>
</div>
```

---

## 🎬 Animations (Simple)

```scss
// Standard transition
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

// Active state
&:active {
  transform: scale(0.95);
}

// Slide in
animation: slideIn 0.3s ease-out;
```

**Classes:**

```html
<div class="fade-in">Fades in</div>
<div class="slide-up">Slides up</div>
```

---

## 💡 Pro Tips

### Import Paths (Count Folders):

```scss
// 4 levels: pages/sell/
@use '../../../../styles/design-system' as ds;

// 3 levels: pages/
@use '../../../styles/design-system' as ds;

// 2 levels: dashboard/
@use '../../styles/design-system' as ds;
```

### Responsive Visibility:

```html
<span class="hidden sm:inline">Desktop only</span> <span class="sm:hidden">Mobile only</span>
```

### Truncate Text:

```html
<div class="truncate">Long text...</div>
<div class="line-clamp-2">Two lines max...</div>
```

### Touch Devices Only:

```scss
@include ds.touch-device {
  // Remove hover effects on mobile
  &:hover {
    background: transparent;
  }
}
```

---

## ♿ Accessibility Checklist

- [ ] Touch targets ≥ 44px on mobile
- [ ] Focus rings visible
- [ ] Color contrast ratios met (WCAG AA)
- [ ] Semantic HTML
- [ ] ARIA labels on icon buttons
- [ ] Keyboard navigation works

---

## 🔧 Troubleshooting

**Build Error: "Can't find stylesheet"**
→ Fix import path (count folders from component to `src/styles/`)

**SASS Warning: "Mixed declarations"**
→ Wrap properties in `& {}` after mixins

**Buttons too small on mobile**
→ Add `min-h-[3rem]` (48px)

**Numbers not aligning**
→ Use `text-tabular` class

---

## 📦 Dashboard Components

### Gradient Stat Card:
```html
<div class="card bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 
            transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
  <div class="card-body p-3 lg:p-4">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <svg class="h-5 w-5 text-primary">...</svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-base-content/60">Label</p>
        <p class="text-xl font-bold text-primary tabular-nums">Value</p>
      </div>
    </div>
  </div>
</div>
```

### Quick Action Button:
```html
<button class="flex flex-col items-center gap-2 p-4 rounded-xl bg-base-100 
               border border-base-300 active:scale-95 transition-all">
  <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
    <svg class="h-6 w-6 text-primary">...</svg>
  </div>
  <span class="text-xs font-medium">Label</span>
</button>
```

### Primary CTA (Full Width Mobile):
```html
<button class="w-full btn btn-primary btn-lg gap-3 shadow-lg shadow-primary/20 
               active:scale-[0.98] transition-transform">
  <svg class="h-6 w-6">...</svg>
  <span class="text-base font-semibold">Action</span>
</button>
```

### Horizontal Scroll Stats (Mobile):
```html
<div class="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:grid sm:grid-cols-4 scrollbar-hide">
  <div class="flex-shrink-0 w-[140px] sm:w-auto">...</div>
</div>
```

### Dashboard Animations (Import):
```scss
@use '../../styles/dashboard-animations' as *;
```

### Mobile left drawer (sidebar)
When the drawer opens on mobile, the left nav must read as a **solid panel**, not a transparent overlay.

| Element | Pattern | Rationale |
|--------|---------|-----------|
| **Overlay (scrim)** | `bg-base-content/50 backdrop-blur-md` | Strong enough to dim content and focus attention on the drawer. Avoid `bg-base-content/20` (too transparent). |
| **Drawer panel** | `bg-base-100` + `shadow-2xl` + `border-r border-base-300` | Solid surface (same as top navbar). Shadow reinforces depth; border clarifies edge. |
| **Panel background (SCSS)** | `background: oklch(var(--b1));` | Ensures opaque base-100 so the panel never looks washed out in any theme. |

- Use **base-100** for the panel so it matches the top bar and reads as a single “surface.”
- Active/hover nav items use `bg-base-200` so they stay clearly visible on base-100.
- Touch targets in the drawer: keep `min-h-[2.75rem]` on nav links.

### Page Color Mapping:
| Page | Color | Variable |
|------|-------|----------|
| Products | primary | `--p` |
| Orders | secondary | `--s` |
| Payments | success | `--su` |
| Customers | info | `--in` |
| Suppliers | accent | `--a` |

### Dashboard Overview Category Colors:
| Category | Color | Variable | Rationale |
|----------|-------|----------|-----------|
| Sales | success | `--su` | Revenue = positive |
| Purchases | info | `--in` | Stock purchases = neutral |
| Expenses | error | `--er` | Costs = negative |

### Search Bar:

```html
<div class="card bg-base-100 shadow-lg">
  <div class="card-body p-3">
    <input
      type="text"
      class="input input-ghost text-base sm:text-lg"
      placeholder="Search..."
      autofocus
    />
  </div>
</div>
```

### Action Bar:

```html
<div class="fixed bottom-0 left-0 right-0 bg-base-100 border-t-2 z-40 shadow-xl">
  <div class="container-app py-3">
    <!-- Error counter when disabled -->
    @if (errorCount > 0) {
    <p class="text-xs text-error text-center mb-2">{{ errorCount }} issues to fix</p>
    }
    <div class="flex gap-2">
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn btn-primary flex-1 min-h-[3rem]">
        @if (canSubmit) { ✓ Create } @else { {{ errorCount }} Issues }
      </button>
    </div>
  </div>
</div>
```

---

## 📚 File Reference

- **Design System**: `src/styles/_design-system.scss`
- **Patterns**: `src/styles/_design-patterns.scss`
- **Global**: `src/styles.scss`

**Examples:**

- Dashboard: `pages/overview/`
- POS: `pages/sell/`
- Layout: `layout/dashboard-layout.component.html`

---

## 🎯 KISS UI Patterns

### Emojis Over Text

```html
<!-- ❌ Verbose -->
<button>Upload Product Photo</button>

<!-- ✅ Simple -->
<button>📸 Add Photos</button>
```

### Subtle Help (Mobile-Friendly)

```html
<!-- ✅ Native title attribute - works on mobile (long press) & desktop (hover) -->
<label class="cursor-help" title="Helpful context here"> 📦 Field Name </label>

<!-- ❌ Avoid tooltips inside collapsible/interactive elements -->
<div class="collapse">
  <div class="tooltip">❌ Can interfere with parent interactions</div>
</div>

<!-- ✅ Use placeholders for examples -->
<input placeholder="e.g., Blue Jeans XL" />
```

### Compact Spacing

```html
<!-- Use gap-2 instead of gap-4 for tight layouts -->
<div class="space-y-2">
  <!-- 8px -->
  <div class="grid grid-cols-3 gap-2">...</div>
</div>
```

### Empty States

```html
<!-- Clear CTA with emoji -->
<button class="btn btn-outline btn-block h-auto py-6 flex-col">
  <span class="text-4xl">📸</span>
  <span>Add Photos</span>
  <span class="text-xs opacity-60">Camera or gallery</span>
</button>
```

### Smart Visibility

```html
<!-- Mobile: always visible, Desktop: hover -->
<button class="btn sm:opacity-0 sm:group-hover:opacity-100">✕</button>
```

---

## ✨ Remember: KISS

1. **Mobile First** - Phones are your primary users
2. **Spacing Scale** - Use gap-2 for compact, gap-4 for breathable
3. **Touch Targets** - 44px minimum
4. **Emojis** - Replace text with clear emojis
5. **Tooltips** - "?" badges for optional context
6. **Simple** - Less text, more clarity

**Your users are on phones - optimize for them!** 📱
