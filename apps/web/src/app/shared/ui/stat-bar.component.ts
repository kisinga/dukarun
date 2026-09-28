import { Component, input, output } from '@angular/core';

/** One metric in a StatBar. `filter` makes it an independent toggle chip. */
export interface StatItem {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'primary' | 'info';
  /** If set, the item is a clickable filter toggle emitting this key. */
  filter?: string;
  active?: boolean;
  /** Visual hierarchy only: supporting metrics always remain visible. */
  emphasis?: 'primary' | 'supporting';
  /** Legacy presentation hint; all supplied metrics remain visible at every width. */
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
      @for (s of stats(); track s.label) {
        @if (s.filter) {
          <button
            type="button"
            (click)="select.emit(s.filter!)"
            [attr.aria-pressed]="!!s.active"
            class="stat-bar-item cursor-pointer text-left transition-colors"
            [class.stat-bar-primary]="(s.emphasis ?? s.mobilePriority) === 'primary'"
            [class]="s.active ? 'bg-primary/10' : 'hover:bg-base-200/60'"
          >
            <span class="text-sm font-semibold leading-5 tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="stat-bar-label text-xs leading-4 text-muted">{{ s.label }}</span>
          </button>
        } @else {
          <span
            class="stat-bar-item"
            [class.stat-bar-primary]="(s.emphasis ?? s.mobilePriority) === 'primary'"
          >
            <span class="text-sm font-semibold leading-5 tabular-nums" [class]="toneClass(s)">{{
              s.value
            }}</span>
            <span class="stat-bar-label text-xs leading-4 text-muted">{{ s.label }}</span>
          </span>
        }
      }
    </div>
  `,
  styles: `
    .stat-bar-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .stat-bar-item {
      display: inline-flex;
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

    .stat-bar-primary > span:first-child {
      font-size: 1.125rem;
      line-height: 1.5rem;
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
  protected toneClass(s: StatItem): string {
    // A zero count carries no urgency — never paint a 0 as an alert.
    const tone = Number(s.value) === 0 ? 'neutral' : (s.tone ?? 'neutral');
    return VALUE_TONE[tone];
  }
}
