import { Component, computed, input, output, signal } from '@angular/core';

/** One metric in a StatBar. `filter` makes it an independent toggle chip. */
export interface StatItem {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'primary' | 'info';
  /** If set, the item is a clickable filter toggle emitting this key. */
  filter?: string;
  active?: boolean;
  /** Phones show two primary metrics first; secondary metrics expand on demand. */
  mobilePriority?: 'primary' | 'secondary';
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
    <div class="grid w-full min-w-0 grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3">
      @for (s of stats(); track s.label; let index = $index) {
        @if (s.filter) {
          <button
            type="button"
            (click)="select.emit(s.filter!)"
            [attr.aria-pressed]="!!s.active"
            class="min-h-11 w-full cursor-pointer flex-col items-start justify-center gap-0.5 rounded-field border px-3 py-1.5 text-left transition-colors"
            [class]="itemClass(s, index, true)"
          >
            <span class="text-sm font-bold leading-none tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs leading-tight text-base-content/60">{{ s.label }}</span>
          </button>
        } @else {
          <span
            class="min-w-0 flex-col items-start justify-center gap-0.5 border-l border-base-300 pl-3"
            [class]="itemClass(s, index, false)"
          >
            <span class="text-sm font-bold leading-none tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="text-xs leading-tight text-base-content/60">{{ s.label }}</span>
          </span>
        }
      }
    </div>
    @if (hasSecondary()) {
      <button
        type="button"
        class="mt-1 min-h-11 text-xs font-semibold text-base-content/65 md:hidden"
        [attr.aria-expanded]="expanded()"
        (click)="expanded.set(!expanded())"
      >
        {{ expanded() ? 'Less summary' : 'More summary' }}
      </button>
    }
  `,
})
export class StatBarComponent {
  readonly stats = input.required<StatItem[]>();
  readonly select = output<string>();
  protected readonly expanded = signal(false);
  protected readonly hasSecondary = computed(() =>
    this.stats().some((stat, index) => this.isMobileSecondary(stat, index))
  );

  protected itemClass(s: StatItem, index: number, interactive: boolean): string {
    const responsive =
      this.isMobileSecondary(s, index) && !this.expanded()
        ? 'hidden md:inline-flex'
        : 'inline-flex';
    if (!interactive) return responsive;
    const state = s.active
      ? 'border-base-content/25 bg-base-200'
      : 'border-base-300 bg-base-100 hover:bg-base-200/60';
    return `${responsive} ${state}`;
  }

  private isMobileSecondary(s: StatItem, index: number): boolean {
    return s.mobilePriority === 'secondary' || (s.mobilePriority === undefined && index >= 2);
  }

  protected toneClass(s: StatItem): string {
    // A zero count carries no urgency — never paint a 0 as an alert.
    const tone = Number(s.value) === 0 ? 'neutral' : (s.tone ?? 'neutral');
    return VALUE_TONE[tone];
  }
}
