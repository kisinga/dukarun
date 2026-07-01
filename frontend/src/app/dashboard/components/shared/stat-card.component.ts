import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Semantic tone for a stat. `neutral` = no colour (the default) — per the design
 * spec, colour is reserved for meaning, so a plain count stays `base-content`.
 * A tone is applied only when the value itself carries meaning (overdue → error,
 * paid → success, needs-attention → warning …).
 */
export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

// Static class maps — Tailwind v4 purges interpolated class strings, so every
// class must appear here as a complete literal.
const VALUE_CLASS: Record<StatTone, string> = {
  neutral: 'text-base-content',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

const ICON_TINT: Record<StatTone, string> = {
  neutral: 'bg-base-200 text-base-content/70',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
};

const RING_CLASS: Record<StatTone, string> = {
  neutral: 'ring-2 ring-base-content/30',
  primary: 'ring-2 ring-primary',
  success: 'ring-2 ring-success',
  warning: 'ring-2 ring-warning',
  error: 'ring-2 ring-error',
  info: 'ring-2 ring-info',
};

const SURFACE = 'rounded-box border border-base-300/60 bg-base-100 shadow-sm p-3 sm:p-4';

/**
 * Dashboard KPI card — one card recipe, clear hierarchy.
 *
 * Hierarchy (per spec §1/§2): the value is the hero (≤24px, bold, tight,
 * tabular); the label is small + muted; the icon is a subtle signifier. Colour
 * is applied to the value only when `tone` is meaningful.
 *
 * When `interactive` it renders as a button with hover + active-ring signifiers
 * (spec §5 "every action needs a response") and emits `select`.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (interactive()) {
      <button type="button" [class]="containerClass()" (click)="select.emit()">
        <ng-container [ngTemplateOutlet]="body" />
      </button>
    } @else {
      <div [class]="containerClass()">
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }

    <ng-template #body>
      <div class="flex items-center gap-3">
        @if (icon(); as ic) {
          <span
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            [class]="iconTintClass()"
          >
            <ng-icon [name]="ic" size="1.25rem" />
          </span>
        }
        <div class="min-w-0 flex-1">
          <p class="text-xs text-base-content/60 truncate">{{ label() }}</p>
          <p
            class="text-2xl font-bold tracking-tight leading-tight tabular-nums truncate"
            [class]="valueClass()"
          >
            {{ value() }}
          </p>
          @if (hint(); as h) {
            <p class="text-xs text-base-content/50 truncate">{{ h }}</p>
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** Semantic tone; `neutral` (default) leaves the value uncoloured. */
  readonly tone = input<StatTone>('neutral');
  /** Optional ng-icon name (must be in APP_ICONS), e.g. 'heroUsers'. */
  readonly icon = input<string>();
  /** Optional supporting line under the value (e.g. "3 overdue"). */
  readonly hint = input<string>();
  /** Render as a filter button with hover + active-ring signifiers. */
  readonly interactive = input<boolean>(false);
  readonly active = input<boolean>(false);
  readonly select = output<void>();

  readonly valueClass = computed(() => VALUE_CLASS[this.tone()]);
  readonly iconTintClass = computed(() => ICON_TINT[this.tone()]);

  readonly containerClass = computed(() => {
    const base = SURFACE;
    if (!this.interactive()) return base;
    const interactive =
      'w-full text-left hover:shadow-md active:scale-[0.98] transition-all touch-manipulation cursor-pointer';
    const ring = this.active() ? RING_CLASS[this.tone()] : '';
    return `${base} ${interactive} ${ring}`.trim();
  });
}
