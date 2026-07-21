import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-trend-indicator',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums"
      [class.text-success]="isUp()"
      [class.text-error]="!isUp()"
    >
      <ng-icon [name]="isUp() ? 'heroArrowTrendingUp' : 'heroArrowTrendingDown'" size="0.875rem" />
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
