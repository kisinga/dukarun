import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Minimal presentational KPI for at-a-glance strips: label + value (or loading).
 * Use for consistent single-metric display (e.g. Overview strip, future dashboards).
 */
@Component({
  selector: 'app-stat-card-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span>
      @if (loading()) {
        <span class="loading loading-spinner loading-xs text-primary"></span>
      } @else {
        <span class="font-bold text-base-content tabular-nums">{{ value() }}</span>
      }
      {{ label() }}
    </span>
  `,
})
export class StatCardStripComponent {
  label = input.required<string>();
  value = input<string | number>('');
  loading = input(false);
}
