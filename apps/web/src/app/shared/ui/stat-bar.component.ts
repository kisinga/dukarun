import { Component, input, output } from '@angular/core';

/** One metric in a StatBar. `filter` makes it an independent toggle chip. */
export interface StatItem {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'primary' | 'info';
  /** If set, the item is a clickable filter toggle emitting this key. */
  filter?: string;
  active?: boolean;
}

// Full literal classes (Tailwind v4 purge-safe).
const VALUE_TONE: Record<string, string> = {
  neutral: 'text-base-content',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  primary: 'text-primary',
  info: 'text-info',
};

/**
 * Compact, single-line page summary — a wrapping row of "value label" metrics
 * (ported from the old app; zero counts are never painted as alerts).
 */
@Component({
  selector: 'app-stat-bar',
  template: `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      @for (s of stats(); track s.label) {
        @if (s.filter) {
          <button
            type="button"
            (click)="select.emit(s.filter!)"
            [attr.aria-pressed]="!!s.active"
            class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 transition-colors"
            [class]="
              s.active
                ? 'border-base-content/25 bg-base-200'
                : 'border-base-300 bg-base-100 hover:bg-base-200/60'
            "
          >
            <span class="text-sm font-bold leading-none tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs leading-none text-base-content/60">{{ s.label }}</span>
          </button>
        } @else {
          <span
            class="inline-flex items-baseline gap-1.5 border-r border-base-300 pr-4 last:border-r-0 last:pr-0"
          >
            <span class="text-sm font-bold leading-none tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs leading-none text-base-content/60">{{ s.label }}</span>
          </span>
        }
      }
    </div>
  `,
})
export class StatBarComponent {
  readonly stats = input.required<StatItem[]>();
  readonly select = output<string>();

  protected toneClass(s: StatItem): string {
    // A zero count carries no urgency — never paint a 0 as an alert.
    const tone = Number(s.value) === 0 ? 'neutral' : (s.tone ?? 'neutral');
    return VALUE_TONE[tone];
  }
}
