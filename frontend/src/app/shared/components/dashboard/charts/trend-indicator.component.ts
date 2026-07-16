import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-trend-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
      [class.text-success]="isUp()"
      [class.text-error]="!isUp()"
    >
      <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
        @if (isUp()) {
          <path d="M6 2l4 6H2l4-6z" />
        } @else {
          <path d="M6 10L2 4h8L6 10z" />
        }
      </svg>
      {{ absValue() }}%
    </span>
  `,
})
export class TrendIndicatorComponent {
  /** Percentage change — positive = up, negative = down */
  value = input(0);

  isUp = computed(() => this.value() >= 0);
  absValue = computed(() => Math.abs(this.value()).toFixed(1));
}
