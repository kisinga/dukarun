import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Semantic tone for a stat. Drives the value colour and the icon-accent tint.
 * `neutral` keeps the value uncoloured (a plain count) — colour is reserved for
 * meaning (spec §4), not decoration.
 */
export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

/** A small trend / context chip beside the value (e.g. "▲ +12", "3 overdue"). */
export interface StatDelta {
  text: string;
  tone?: StatTone;
  /** ng-icon name, e.g. 'heroArrowTrendingUp'. */
  icon?: string;
}

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

// Icon accent: neutral gets a brand tint so a plain count still has a colour pop.
const ICON_CHIP: Record<StatTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
};

const DELTA_TEXT: Record<StatTone, string> = {
  neutral: 'text-base-content/50',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

const RING_CLASS: Record<StatTone, string> = {
  neutral: 'ring-2 ring-primary',
  primary: 'ring-2 ring-primary',
  success: 'ring-2 ring-success',
  warning: 'ring-2 ring-warning',
  error: 'ring-2 ring-error',
  info: 'ring-2 ring-info',
};

// Filled background for the active/selected filter state ("highlighted
// container = selected" — the video's signifier).
const ACTIVE_BG: Record<StatTone, string> = {
  neutral: 'bg-primary/10',
  primary: 'bg-primary/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  error: 'bg-error/10',
  info: 'bg-info/10',
};

// Background is applied in containerClass (never in SURFACE) so the active tint
// reliably wins over the default.
const SURFACE =
  'rounded-2xl border border-base-300/60 shadow-sm p-4 h-full flex flex-col justify-center';

/**
 * Dashboard KPI card — rebuilt from the design principles.
 *
 * Reading order top→bottom: a small muted **label** with a small tone-tinted
 * **icon accent** (colour pop + scanning), then the **value** as the hero
 * (≤24px, bold, tight, tabular; coloured only when the tone is meaningful), then
 * an optional trend/`hint`. The value/label size contrast *is* the hierarchy.
 *
 * `interactive` renders a filter button with hover-lift + active-ring signifiers
 * (spec §5) and emits `select`.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 h-full' },
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
      <!-- label + icon accent -->
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-base-content/60 truncate">{{ label() }}</p>
        @if (icon(); as ic) {
          <span
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            [class]="iconChipClass()"
          >
            <ng-icon [name]="ic" size="1.125rem" />
          </span>
        }
      </div>

      <!-- value (hero) + optional trend -->
      <div class="mt-2 flex items-baseline gap-1.5 min-w-0">
        <span
          class="text-2xl font-bold tracking-tight leading-none tabular-nums truncate"
          [class]="valueClass()"
        >
          {{ value() }}
        </span>
        @if (delta(); as d) {
          <span
            class="inline-flex items-center gap-0.5 text-xs font-semibold shrink-0"
            [class]="deltaTextClass()"
          >
            @if (d.icon) {
              <ng-icon [name]="d.icon" size="0.75rem" />
            }
            {{ d.text }}
          </span>
        }
      </div>

      @if (hint(); as h) {
        <p class="text-xs text-base-content/50 truncate mt-1">{{ h }}</p>
      }
    </ng-template>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** Semantic tone; drives value colour + icon-accent tint. */
  readonly tone = input<StatTone>('neutral');
  /** ng-icon name (must be in APP_ICONS), e.g. 'heroUsers'. */
  readonly icon = input<string>();
  /** Secondary muted line under the value — the single most important extra fact, or omit. */
  readonly hint = input<string>();
  /** Trend / context chip beside the value. */
  readonly delta = input<StatDelta>();
  /** Render as a filter button with hover-lift + active-ring signifiers. */
  readonly interactive = input<boolean>(false);
  readonly active = input<boolean>(false);
  readonly select = output<void>();

  readonly valueClass = computed(() => VALUE_CLASS[this.tone()]);
  readonly iconChipClass = computed(() => ICON_CHIP[this.tone()]);
  readonly deltaTextClass = computed(() => DELTA_TEXT[this.delta()?.tone ?? 'neutral']);

  readonly containerClass = computed(() => {
    if (!this.interactive()) return `${SURFACE} bg-base-100`;
    const interactive =
      'w-full text-left cursor-pointer transition-all duration-200 touch-manipulation';
    if (this.active()) {
      // Selected: filled tone tint + ring — unmistakably "on".
      return `${SURFACE} ${ACTIVE_BG[this.tone()]} ${RING_CLASS[this.tone()]} ${interactive}`;
    }
    // Resting-but-clickable: plain surface with a hover-lift affordance.
    return `${SURFACE} bg-base-100 hover:bg-base-200/50 hover:shadow-md hover:-translate-y-0.5 ${interactive}`;
  });
}
