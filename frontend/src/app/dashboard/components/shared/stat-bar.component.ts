import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * One metric in a StatBar. `filter` makes it an independent toggle chip
 * (multi-select); `tone` colours the value only when it carries meaning.
 */
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
 * Compact, single-line page summary — a wrapping row of "value label" metrics.
 *
 * Deliberately lightweight: page-level counts don't warrant cards. Metrics with
 * a `filter` render as toggle chips (hover + filled-when-active signifier); they
 * toggle independently (multi-select) and emit `select`. Plain metrics are text.
 * Sits naturally next to / under a page title.
 */
@Component({
  selector: 'app-stat-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2">
      @for (s of stats(); track s.label) {
        @if (s.filter) {
          <button
            type="button"
            (click)="select.emit(s.filter!)"
            [attr.aria-pressed]="!!s.active"
            class="inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 transition-colors cursor-pointer"
            [class]="
              s.active
                ? 'border-base-content/25 bg-base-200'
                : 'border-base-300 bg-base-100 hover:bg-base-200/60'
            "
          >
            <span class="text-sm font-semibold tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs text-base-content/60">{{ s.label }}</span>
          </button>
        } @else {
          <span
            class="inline-flex items-baseline gap-1.5 rounded-full border border-base-300 bg-base-100 px-3 py-1"
          >
            <span class="text-sm font-semibold tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs text-base-content/60">{{ s.label }}</span>
          </span>
        }
      }
    </div>
  `,
})
export class StatBarComponent {
  readonly stats = input.required<StatItem[]>();
  readonly select = output<string>();

  toneClass(s: StatItem): string {
    return VALUE_TONE[s.tone ?? 'neutral'];
  }
}
