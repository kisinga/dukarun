import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RankedListComponent, type RankedItem } from './ranked-list.component';

/**
 * Thin presentational card: title + empty state or ranked list.
 * Used for product analytics (Top Selling, Highest Margin, etc.) and stock value drill-down.
 */
@Component({
  selector: 'app-ranked-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl border border-base-300 bg-base-100 p-3">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-base-content/50 mb-2">
        {{ title() }}
      </p>
      @if (items().length === 0) {
        <p class="text-xs text-base-content/40 text-center py-3">{{ emptyMessage() }}</p>
      } @else {
        <app-ranked-list [items]="items()" [barColor]="barColor()" />
      }
    </div>
  `,
  imports: [RankedListComponent],
})
export class RankedCardComponent {
  readonly title = input.required<string>();
  readonly items = input<RankedItem[]>([]);
  readonly emptyMessage = input<string>('No data');
  readonly barColor = input<'primary' | 'secondary' | 'success' | 'warning'>('primary');
}
