import { Component, input } from '@angular/core';

/**
 * Stat card (The Counter — "Money talks first"): caption label, hero number
 * (24px cap, tabular-nums), optional sub-line. `tone` is money-meaning only:
 * success = received/positive, error = owed/failed, warning = needs attention.
 */
@Component({
  selector: 'app-stat-card',
  host: { class: 'block h-full' },
  template: `
    <div class="card h-full bg-base-100">
      <div class="card-body p-4">
        <p class="type-caption">{{ label() }}</p>
        <p
          class="type-hero mt-1"
          [class.text-success]="tone() === 'success'"
          [class.text-error]="tone() === 'error'"
          [class.text-warning]="tone() === 'warning'"
        >
          {{ value() }}
        </p>
        @if (sub()) {
          <p class="mt-0.5 text-xs text-base-content/60">{{ sub() }}</p>
        }
        @if (action()) {
          <p class="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">
            {{ action() }} <span aria-hidden="true">→</span>
          </p>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly sub = input<string>();
  readonly action = input<string>();
  readonly tone = input<'neutral' | 'success' | 'error' | 'warning'>('neutral');
}
