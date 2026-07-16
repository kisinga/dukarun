import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface RankedItem {
  label: string;
  sublabel?: string;
  value: number;
  displayValue?: string;
}

@Component({
  selector: 'app-ranked-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-1.5">
      @for (item of items(); track item.label; let i = $index) {
        <div class="flex items-center gap-2">
          <span
            class="text-[10px] font-bold text-base-content/30 w-4 tabular-nums text-right shrink-0"
          >
            {{ i + 1 }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-0.5">
              <span class="text-xs font-medium truncate text-base-content/80">{{
                item.label
              }}</span>
              <span class="text-xs font-bold tabular-nums text-base-content shrink-0">
                {{ item.displayValue ?? item.value }}
              </span>
            </div>
            <div class="h-1 rounded-full bg-base-300 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                [class]="barColorClass()"
                [style.width.%]="barWidth(item.value)"
              ></div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class RankedListComponent {
  items = input<RankedItem[]>([]);
  barColor = input<'primary' | 'secondary' | 'success' | 'warning'>('primary');

  barColorClass = computed(() => `bg-${this.barColor()}`);

  private maxValue = computed(() => Math.max(...this.items().map((i) => i.value), 1));

  barWidth(value: number): number {
    return Math.round((value / this.maxValue()) * 100);
  }
}
