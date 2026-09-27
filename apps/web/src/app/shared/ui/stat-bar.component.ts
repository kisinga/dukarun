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
 * Compact page summary. Metrics wrap with the space available in the toolbar;
 * zero counts are never painted as alerts.
 */
@Component({
  selector: 'app-stat-bar',
  host: { class: 'block min-w-0' },
  template: `
    <div class="stat-bar-grid">
      @for (s of stats(); track s.label; let index = $index) {
        @if (s.filter) {
          <button
            type="button"
            (click)="select.emit(s.filter!)"
            [attr.aria-pressed]="!!s.active"
            class="stat-bar-item cursor-pointer text-left transition-colors"
            [class]="itemClass(s, index, true)"
          >
            <span class="text-sm font-semibold leading-5 tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="stat-bar-label text-xs leading-4 text-muted">{{ s.label }}</span>
          </button>
        } @else {
          <span class="stat-bar-item" [class]="itemClass(s, index, false)">
            <span class="text-sm font-semibold leading-5 tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="stat-bar-label text-xs leading-4 text-muted">{{ s.label }}</span>
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
  styles: `
    .stat-bar-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .stat-bar-item {
      min-width: 0;
      min-height: 2.75rem;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 0.125rem;
      border: 0;
      border-radius: 0;
      padding: 0.125rem 0.5rem;
      box-shadow: inset 1px 0 var(--surface-border);
    }

    .stat-bar-item:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    @media (min-width: 768px) {
      .stat-bar-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(6rem, 100%), 1fr));
        align-items: stretch;
      }
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
    const state = s.active ? 'bg-primary/10' : 'hover:bg-base-200/60';
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
